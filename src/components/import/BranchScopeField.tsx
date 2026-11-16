import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/FormControls'
import { BRANDS, type BrandId } from '@/config/brands'
import type { BranchScope } from '@/types/dataset'

interface BranchScopeFieldProps {
  brandId: BrandId | undefined
  value: BranchScope | undefined
  onChange: (next: BranchScope) => void
}

/**
 * Declares which branches a file without a branch column covers. Only a single selected
 * branch lets rows be attributed to that branch; nothing is split across branches.
 */
export function BranchScopeField({ brandId, value, onChange }: BranchScopeFieldProps) {
  const [custom, setCustom] = useState('')
  const known = brandId ? BRANDS[brandId].branches : []
  const selected = value?.mode === 'selected' ? value.branches : []
  const options = [...new Set([...known, ...selected])]

  const toggle = (branch: string) =>
    onChange({ mode: 'selected', branches: selected.includes(branch) ? selected.filter((b) => b !== branch) : [...selected, branch] })

  return (
    <fieldset className="rounded-lg border border-slate-200 p-3">
      <legend className="px-1 text-xs font-medium text-slate-700">
        Branch scope <span className="text-red-600">*</span>
      </legend>
      <p className="mb-2 text-xs text-slate-500">This file has no branch column. Which branches does it cover?</p>
      <div className="space-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" name="branch-scope" checked={value?.mode === 'all'} onChange={() => onChange({ mode: 'all', branches: [] })} />
          All selected branches{known.length > 0 ? ` (${known.join(', ')})` : ''} — combined
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="branch-scope" checked={value?.mode === 'selected'} onChange={() => onChange({ mode: 'selected', branches: selected })} />
          Specific branches
        </label>
        {value?.mode === 'selected' && (
          <div className="ml-6 space-y-2">
            <div className="flex flex-wrap gap-3">
              {options.map((b) => (
                <label key={b} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={selected.includes(b)} onChange={() => toggle(b)} className="size-4 rounded border-slate-300" />
                  {b}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <TextInput value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Add a branch name" className="max-w-56" aria-label="Add a branch name" />
              <Button
                disabled={!custom.trim()}
                onClick={() => {
                  if (!selected.includes(custom.trim())) onChange({ mode: 'selected', branches: [...selected, custom.trim()] })
                  setCustom('')
                }}
              >
                Add
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              {selected.length === 1 ? `Rows will be attributed to ${selected[0]} (declared by you).` : selected.length > 1 ? 'Several branches combined — results are not split by branch.' : 'Select at least one branch.'}
            </p>
          </div>
        )}
      </div>
    </fieldset>
  )
}
