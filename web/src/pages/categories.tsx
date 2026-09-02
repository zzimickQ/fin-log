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
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import { Folder, FolderPlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CategoryDialogState {
  mode: 'create' | 'edit'
  parentId?: string
  category?: CategoryNode
}

/**
 * Category manager. Structure only — grouped as one card per main category,
 * with sub-categories rendered as nested sub-cards.
 */
export function CategoriesPage() {
  const { familyId = '' } = useParams<{ familyId: string }>()
  const { data: family } = useFamilyQuery(familyId)
  const [dialog, setDialog] = useState<CategoryDialogState | null>(null)
  const [moving, setMoving] = useState<CategoryNode | null>(null)
  const [deleting, setDeleting] = useState<CategoryNode | null>(null)

  const categories = family?.categories ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Categories</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Shared across ledgers of the family. Main categories nest their
            sub-categories.
          </p>
        </div>
        <Button size="sm" onClick={() => setDialog({ mode: 'create' })}>
          <Plus />
          New category
        </Button>
      </div>

      {categories.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No categories yet. Create one to organize expenses later.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {categories.map((root) => (
            <MainCategoryCard
              key={root.id}
              node={root}
              onAddChild={(n) => setDialog({ mode: 'create', parentId: n.id })}
              onEdit={(n) => setDialog({ mode: 'edit', category: n })}
              onMove={setMoving}
              onDelete={setDeleting}
            />
          ))}
        </div>
      )}

      {dialog && (
        <CategoryDialog
          key={
            dialog.mode === 'edit'
              ? `edit-${dialog.category!.id}`
              : `create-${dialog.parentId ?? 'root'}`
          }
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

// ---------- tree rendering: card + sub-cards ----------

/** One top-level category as a card; its children are sub-cards inside. */
function MainCategoryCard({
  node,
  onAddChild,
  onEdit,
  onMove,
  onDelete,
}: {
  node: CategoryNode
  onAddChild: (n: CategoryNode) => void
  onEdit: (n: CategoryNode) => void
  onMove: (n: CategoryNode) => void
  onDelete: (n: CategoryNode) => void
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 px-4 py-3">
        <CardTitle className="flex min-w-0 items-center gap-2 text-base">
          <Folder className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{node.name}</span>
        </CardTitle>
        <NodeActions node={node} onAddChild={onAddChild} onEdit={onEdit} onMove={onMove} onDelete={onDelete} />
      </CardHeader>
      {node.children.length > 0 && (
        <CardContent className="flex flex-col gap-1.5 px-3 pb-3 pt-0">
          {node.children.map((child) => (
            <SubCategoryCard
              key={child.id}
              node={child}
              depth={1}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onMove={onMove}
              onDelete={onDelete}
            />
          ))}
        </CardContent>
      )}
    </Card>
  )
}

/**
 * A nested category. Depth 1 renders as a sub-card; deeper levels render as
 * indented rows inside their parent's sub-card.
 */
function SubCategoryCard({
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
  const hasChildren = node.children.length > 0

  return (
    <div className={cn(depth === 1 && 'rounded-lg border bg-muted/40')}>
      <div
        className={cn(
          'flex items-center justify-between gap-2 py-2',
          depth === 1 ? 'px-3' : 'px-2',
        )}
      >
        <span
          className="flex min-w-0 items-center gap-1.5 text-sm font-medium"
          style={{ paddingLeft: depth > 1 ? 10 : 0 }}
        >
          <span className="truncate">{node.name}</span>
        </span>
        <NodeActions
          node={node}
          onAddChild={onAddChild}
          onEdit={onEdit}
          onMove={onMove}
          onDelete={onDelete}
        />
      </div>
      {hasChildren && (
        <div
          className={cn(
            'flex flex-col border-t bg-card/60',
            depth === 1 ? 'rounded-b-lg px-2 py-1.5' : 'px-2 pb-1.5',
          )}
        >
          {node.children.map((child) => (
            <SubCategoryCard
              key={child.id}
              node={child}
              depth={depth + 1}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onMove={onMove}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Per-node actions: add child, edit, move, delete. Outlined with clear
 * padding so the touch targets are visible on mobile.
 */
function NodeActions({
  node,
  onAddChild,
  onEdit,
  onMove,
  onDelete,
}: {
  node: CategoryNode
  onAddChild: (n: CategoryNode) => void
  onEdit: (n: CategoryNode) => void
  onMove: (n: CategoryNode) => void
  onDelete: (n: CategoryNode) => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Button
        variant="outline"
        aria-label={`Add sub-category under ${node.name}`}
        title="Add sub-category"
        onClick={() => onAddChild(node)}
      >
        <Plus />
      </Button>
      <Button
        variant="outline"
        aria-label={`Edit ${node.name}`}
        title="Edit"
        onClick={() => onEdit(node)}
      >
        <Pencil />
      </Button>
      <Button
        variant="outline"
        aria-label={`Move ${node.name}`}
        title="Move"
        onClick={() => onMove(node)}
      >
        <FolderPlus />
      </Button>
      <Button
        variant="outline"
        className="text-muted-foreground hover:text-destructive"
        aria-label={`Delete ${node.name}`}
        title="Delete"
        onClick={() => onDelete(node)}
      >
        <Trash2 />
      </Button>
    </div>
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
                : 'Create a category. Leave parent empty for a main category.'}
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
                      <SelectValue placeholder="None (main category)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None (main category)</SelectItem>
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

  const validParents = flattenExcluding(categories, node.id)

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
                    <SelectValue placeholder="None (main category)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None (main category)</SelectItem>
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
            {subtreeCount > 1
              ? `Its ${subtreeCount - 1} subcategor${
                  subtreeCount === 2 ? 'y' : 'ies'
                } are deleted too.`
              : 'This category will be removed.'}{' '}
            This cannot be undone.
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
