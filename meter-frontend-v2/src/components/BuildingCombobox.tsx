import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { translitNormalize } from '@/lib/translit'
import { cn } from '@/lib/utils'
import type { Building } from '@/types/api'

interface BuildingComboboxProps {
  buildings: Building[] | undefined
  value: string // bino id (string) yoki 'none'
  onChange: (value: string) => void
  placeholder?: string
}

// Yozib qidiriladigan bino tanlagich — 184+ bino uchun dropdown yaramaydi.
// Qidiruv lotin/kirill farqsiz (translitNormalize).
export function BuildingCombobox({
  buildings,
  value,
  onChange,
  placeholder = '— Binoni tanlang —',
}: BuildingComboboxProps) {
  const [open, setOpen] = useState(false)
  const selected = buildings?.find((b) => String(b.id) === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected ? selected.name : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(itemValue, search) =>
            translitNormalize(itemValue).includes(translitNormalize(search)) ? 1 : 0
          }
        >
          <CommandInput placeholder="Bino qidirish (lotin/kirill)..." />
          <CommandList>
            <CommandEmpty>Bino topilmadi</CommandEmpty>
            {buildings?.map((b) => (
              <CommandItem
                key={b.id}
                value={b.name}
                onSelect={() => {
                  onChange(String(b.id))
                  setOpen(false)
                }}
              >
                <Check
                  className={cn('mr-2 h-4 w-4', String(b.id) === value ? 'opacity-100' : 'opacity-0')}
                />
                <span className="truncate">{b.name}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
