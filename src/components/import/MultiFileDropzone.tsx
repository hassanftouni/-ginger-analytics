import { Upload } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'
import { SUPPORTED_EXTENSIONS } from '@/parsers'
import { cn } from '@/utils/format'

export function MultiFileDropzone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    const files = Array.from(event.dataTransfer.files)
    if (files.length > 0) onFiles(files)
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors',
        dragging ? 'border-accent-500 bg-accent-50' : 'border-slate-200 bg-white',
      )}
    >
      <Upload className="mb-2 size-7 text-slate-400" aria-hidden="true" />
      <p className="text-sm font-medium text-slate-700">Drag and drop exports here</p>
      <p className="text-xs text-slate-500">Several files at once are fine · {SUPPORTED_EXTENSIONS.join(', ')}</p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
      >
        Choose files
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={SUPPORTED_EXTENSIONS.join(',')}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.length > 0) onFiles(files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
