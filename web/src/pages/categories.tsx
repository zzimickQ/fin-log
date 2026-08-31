import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import {
  useCreateCategoryMutation,
  useDeleteCategoryMutation,
  useFamilyQuery,
  useUpdateCategoryMutation,
} from '@/lib/queries'
import { toast } from '@/lib/stores'
import {
  categorySchema,
  moveCategorySchema,
  zodFormResolver,
  type CategoryValues,
  type MoveCategoryValues,
} from '@/lib/validations'
import type { CategoryNode } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FolderPlus, Pencil, Plus, Trash2 } from 'lucide-react'

interface CategoryDialogState {
  mode: 'create' | 'edit'
  parentId?: string
  category?: CategoryNode
}

export function CategoriesPage() {
  const { familyId = '' } = useParams<{ familyId: string }>()
  const { data: family } = useFamilyQuery(familyId)
  const [dialog, setDialog] = useState<CategoryDialogState | null>(null)
  const [moving, setMoving] = useState<CategoryNode | null>(null)
  const [deleting, setDeleting] = useState<CategoryNode | null>(null)

  const categories = family?.categories ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Categories</h2>
        <Button size="sm" onClick={() => setDialog({ mode: 'create' })}>
          <Plus />
          New category
        </Button>
      </div>
      <p className="-mt-2 text-sm text-muted-foreground">
        Shared across all ledgers of the family. Categories can nest to any
        depth — e.g. Food › Groceries › Vegetables.
      </p>

      {categories.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No categories yet. Create one to start organizing expenses.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-2">
            <ul className="flex flex-col">
              {categories.map((node) => (
                <TreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  onAddChild={(n) => setDialog({ mode: 'create', parentId: n.id })}
                  onEdit={(n) => setDialog({ mode: 'edit', category: n })}
                  onMove={setMoving}
                  onDelete={setDeleting}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {dialog && (
        <CategoryDialog
          key={dialog.mode === 'edit' ? `edit-${dialog.category!.id}` : `create-${dialog.parentId ?? 'root'}`}
          familyId={familyId}
          state={dialog}
          categories={categories}
          onClose={() => setDialog(null)}
        />
      )}
      {moving && (
        <MoveDialog
          key={moving.id}
          familyId={familyId}
          node={moving}
          categories={categories}
          onClose={() => setMoving(null)}
        />
      )}
      {deleting && (
        <DeleteDialog
          familyId={familyId}
          node={deleting}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  )
}

function TreeNode({
  node,
  depth,
  onAddChild,
  onEdit,
  onMove,
  onDelete,
}: {
  node: CategoryNode
  depth: number
  onAddChild: (n: CategoryNode) => void
  onEdit: (n: CategoryNode) => void
  onMove: (n: CategoryNode) => void
  onDelete: (n: CategoryNode) => void
}) {
  return (
    <li>
      <div
        className="group flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60"
        style={{ marginLeft: depth * 20 }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm">{node.name}</span>
          <Badge variant="outline" className="shrink-0 text-xs tabular-nums">
            {node.expenseCount}
          </Badge>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Add child to ${node.name}`}
            onClick={() => onAddChild(node)}
          >
            <Plus />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Edit ${node.name}`}
            onClick={() => onEdit(node)}
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Move ${node.name}`}
            onClick={() => onMove(node)}
          >
            <FolderPlus />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-destructive"
            aria-label={`Delete ${node.name}`}
            onClick={() => onDelete(node)}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      {node.children.length > 0 && (
        <ul className="flex flex-col">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onMove={onMove}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

// ---------- create / edit dialog ----------

function CategoryDialog({
  familyId,
  state,
  categories,
  onClose,
}: {
  familyId: string
  state: CategoryDialogState
  categories: CategoryNode[]
  onClose: () => void
}) {
  const createCategory = useCreateCategoryMutation()
  const updateCategory = useUpdateCategoryMutation()
  const isEdit = state.mode === 'edit'
  const category = state.category

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CategoryValues>({
    resolver: zodFormResolver(categorySchema),
    defaultValues: {
      name: isEdit ? category!.name : '',
      description: isEdit ? (category!.description ?? '') : '',
      parentId: isEdit ? (category!.parentId ?? '') : (state.parentId ?? ''),
    },
  })

  async function onSubmit(values: CategoryValues) {
    if (isEdit) {
      await updateCategory.mutateAsync({
        categoryId: category!.id,
        familyId,
        data: {
          name: values.name,
          description: values.description || null,
          parentId: values.parentId || null,
        },
      })
      toast.success(`Category “${values.name}” updated`)
    } else {
      await createCategory.mutateAsync({
        familyId,
        data: {
          name: values.name,
          description: values.description || undefined,
          parentId: values.parentId || null,
        },
      })
      toast.success(`Category “${values.name}” created`)
    }
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit category' : 'New category'}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? 'Rename, describe, or move this category.'
                : 'Create a category. Leave parent empty for a top-level category.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="cat-name">Name</Label>
              <Input
                id="cat-name"
                autoFocus
                aria-invalid={errors.name ? true : undefined}
                {...register('name')}
                placeholder="Food"
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="cat-parent">Parent category</Label>
              <Controller
                control={control}
                name="parentId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="cat-parent" className="w-full">
                      <SelectValue placeholder="None (top level)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None (top level)</SelectItem>
                      {flattenExcluding(
                        categories,
                        isEdit ? category!.id : null,
                      ).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="cat-desc">Description (optional)</Label>
              <Input
                id="cat-desc"
                maxLength={500}
                {...register('description')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------- move dialog ----------

function MoveDialog({
  familyId,
  node,
  categories,
  onClose,
}: {
  familyId: string
  node: CategoryNode
  categories: CategoryNode[]
  onClose: () => void
}) {
  const updateCategory = useUpdateCategoryMutation()
  const {
    handleSubmit,
    control,
    formState: { isSubmitting },
  } = useForm<MoveCategoryValues>({
    resolver: zodFormResolver(moveCategorySchema),
    defaultValues: { parentId: node.parentId ?? '' },
  })

  const validParents = flattenExcluding(categories, node.id).filter(
    (c) => c.id !== node.id,
  )

  async function onSubmit(values: MoveCategoryValues) {
    await updateCategory.mutateAsync({
      categoryId: node.id,
      familyId,
      data: { parentId: values.parentId || null },
    })
    toast.success(`Moved “${node.name}”`)
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
          <DialogHeader>
            <DialogTitle>Move “{node.name}”</DialogTitle>
            <DialogDescription>
              Choose a new parent. Descendants of the category are excluded.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-4">
            <Label htmlFor="move-parent">Parent category</Label>
            <Controller
              control={control}
              name="parentId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="move-parent" className="w-full">
                    <SelectValue placeholder="None (top level)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None (top level)</SelectItem>
                    {validParents.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Moving…' : 'Move'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------- delete dialog ----------

function DeleteDialog({
  familyId,
  node,
  onClose,
}: {
  familyId: string
  node: CategoryNode
  onClose: () => void
}) {
  const deleteCategory = useDeleteCategoryMutation()
  const subtreeCount = countSubtree(node)

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete “{node.name}”?</DialogTitle>
          <DialogDescription>
            This also deletes{' '}
            {subtreeCount > 1
              ? `its ${subtreeCount - 1} subcategor${subtreeCount === 2 ? 'y' : 'ies'}`
              : 'no subcategories'}{' '}
            and uncategorizes any assigned expenses. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={deleteCategory.isPending}
            onClick={() =>
              void deleteCategory
                .mutateAsync({ categoryId: node.id, familyId })
                .then(() => {
                  toast.success(`Deleted “${node.name}”`)
                  onClose()
                })
            }
          >
            {deleteCategory.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- helpers ----------

function countSubtree(node: CategoryNode): number {
  return 1 + node.children.reduce((acc, c) => acc + countSubtree(c), 0)
}

/** Flatten the tree into depth-indented labels, excluding one subtree. */
function flattenExcluding(
  nodes: CategoryNode[],
  excludeId: string | null,
  depth = 0,
): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = []
  for (const node of nodes) {
    if (node.id === excludeId) continue
    out.push({
      id: node.id,
      label: `${'　'.repeat(depth)}${node.name}`,
    })
    if (excludeId === null || !isDescendant(node, excludeId)) {
      out.push(...flattenExcluding(node.children, excludeId, depth + 1))
    }
  }
  return out
}

function isDescendant(node: CategoryNode, targetId: string): boolean {
  return node.children.some(
    (c) => c.id === targetId || isDescendant(c, targetId),
  )
}
