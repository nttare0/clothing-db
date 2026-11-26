"use client";

import { useCallback, useEffect, useState } from "react";
import { PlusIcon, PencilIcon, ArchiveIcon, TagsIcon } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ErrorAlert, EmptyState } from "@/components/state";

type Category = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  productCount: number;
};

export default function CategoriesPage() {
  const [items, setItems] = useState<Category[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api<{ items: Category[] }>("/categories")
      .then((r) => setItems(r.items))
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "Could not load categories."),
      );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setName("");
    setDescription("");
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(cat: Category) {
    setEditing(cat);
    setName(cat.name);
    setDescription(cat.description ?? "");
    setFormError(null);
    setDialogOpen(true);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (!name.trim()) {
      setFormError("Category name is required.");
      return;
    }
    setPending(true);
    try {
      if (editing) {
        await api(`/categories/${editing.id}`, {
          method: "PATCH",
          body: { name: name.trim(), description: description.trim() || null },
        });
        toast.success("Category updated");
      } else {
        await api("/categories", {
          method: "POST",
          body: { name: name.trim(), description: description.trim() || null },
        });
        toast.success("Category created");
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not save the category.");
    } finally {
      setPending(false);
    }
  }

  async function archive(cat: Category) {
    try {
      await api(`/categories/${cat.id}/archive`, { method: "POST" });
      toast.success("Category archived");
      load();
    } catch (err) {
      toast.error("Could not archive", {
        description: err instanceof ApiError ? err.message : "Try again.",
      });
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Categories</h1>
          <p className="text-sm text-muted-foreground">Keep the catalogue consistent. Names are unique, ignoring case.</p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <PlusIcon aria-hidden /> Add category
        </Button>
      </div>

      {error ? <ErrorAlert message={error} onRetry={load} /> : null}

      {items === null && !error ? (
        <Card><CardContent className="flex flex-col gap-2 pt-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 w-full" />)}</CardContent></Card>
      ) : items && items.length === 0 ? (
        <EmptyState
          title="No categories yet"
          description="Categories like T-shirts, Jeans or Jackets keep the catalogue searchable."
          action={<Button size="sm" onClick={openCreate}><PlusIcon aria-hidden /> Add first category</Button>}
        />
      ) : items ? (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Products</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell className="font-medium">{cat.name}</TableCell>
                  <TableCell className="max-w-48 truncate text-muted-foreground">{cat.description ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{cat.productCount}</TableCell>
                  <TableCell>
                    <Badge variant={cat.active ? "success" : "secondary"}>{cat.active ? "Active" : "Archived"}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(cat)} aria-label={`Edit ${cat.name}`}>
                        <PencilIcon />
                      </Button>
                      {cat.active ? (
                        <Button variant="ghost" size="icon-sm" onClick={() => archive(cat)} aria-label={`Archive ${cat.name}`}>
                          <ArchiveIcon />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit category" : "Add category"}</DialogTitle>
            <DialogDescription>Names are stored as entered; uniqueness ignores case.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="category-name">Name *</Label>
              <Input id="category-name" autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="T-shirts" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="category-description">Description</Label>
              <Input id="category-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
            </div>
            {formError ? <p role="alert" className="text-sm text-destructive">{formError}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
