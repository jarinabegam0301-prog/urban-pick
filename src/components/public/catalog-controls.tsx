"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, SearchInput, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import {
  AVAILABILITY_OPTIONS,
  SORT_OPTIONS,
  activeFilterCount,
  filtersToHref,
} from "@/lib/filters";
import { SIZES, type Category, type ProductFilters } from "@/types/store";

type CatalogContext = {
  filters: ProductFilters;
  categories: Category[];
  pending: boolean;
  apply: (next: ProductFilters) => void;
};

const Context = createContext<CatalogContext | null>(null);

function useCatalog(): CatalogContext {
  const value = useContext(Context);
  if (!value) throw new Error("Catalog controls must be inside CatalogProvider");
  return value;
}

export function CatalogProvider({
  filters,
  categories,
  children,
}: {
  filters: ProductFilters;
  categories: Category[];
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function apply(next: ProductFilters) {
    startTransition(() => {
      router.push(filtersToHref({ ...next, page: undefined }), { scroll: false });
    });
  }

  return (
    <Context.Provider value={{ filters, categories, pending, apply }}>{children}</Context.Provider>
  );
}

export function CatalogResults({ children }: { children: ReactNode }) {
  const { pending } = useCatalog();
  return (
    <div
      aria-busy={pending}
      className={cn("transition-opacity", pending && "pointer-events-none opacity-50")}
    >
      {children}
    </div>
  );
}

export function CatalogToolbar() {
  const { filters, apply } = useCatalog();
  const [query, setQuery] = useState(filters.q ?? "");
  const [sheetOpen, setSheetOpen] = useState(false);
  const count = activeFilterCount(filters);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    apply({ ...filters, q: query.trim() || undefined });
  }

  return (
    <div className="grid grid-cols-2 items-center gap-x-2 gap-y-3 md:flex md:gap-3">
      <form
        role="search"
        onSubmit={submitSearch}
        className="col-span-2 w-full min-w-0 md:flex-1"
      >
        <label htmlFor="store-search" className="sr-only">
          Search products
        </label>
        <SearchInput
          id="store-search"
          placeholder="Search products"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </form>

      <div className="col-span-2 grid grid-cols-2 items-center gap-2 md:flex md:shrink-0">
        <Button
          variant="secondary"
          className="w-full justify-center md:w-auto lg:hidden"
          onClick={() => setSheetOpen(true)}
          aria-haspopup="dialog"
        >
          <FilterIcon />
          Filter
          {count ? (
            <span className="rounded-full bg-foreground px-1.5 text-xs text-background">{count}</span>
          ) : null}
        </Button>
        <label htmlFor="store-sort" className="sr-only">
          Sort by
        </label>
        <div className="w-full min-w-0 md:w-40 lg:w-52">
          <Select
            id="store-sort"
            value={filters.sort ?? "newest"}
            onChange={(event) =>
              apply({ ...filters, sort: event.target.value as ProductFilters["sort"] })
            }
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <FilterSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  );
}

function FilterSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { filters, apply } = useCatalog();
  const [draft, setDraft] = useState(filters);
  const [lastFilters, setLastFilters] = useState(filters);
  if (lastFilters !== filters) {
    setLastFilters(filters);
    setDraft(filters);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Filter products"
      variant="sheet"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => setDraft({ q: filters.q, sort: filters.sort, availability: "all" })}
          >
            Clear all
          </Button>
          <Button
            onClick={() => {
              apply(draft);
              onClose();
            }}
          >
            Show results
          </Button>
        </>
      }
    >
      <FilterFields value={draft} onChange={setDraft} idPrefix="sheet" />
    </Modal>
  );
}

export function FilterSidebar() {
  const { filters, apply } = useCatalog();
  const [draft, setDraft] = useState(filters);
  const [lastFilters, setLastFilters] = useState(filters);
  if (lastFilters !== filters) {
    setLastFilters(filters);
    setDraft(filters);
  }
  const changed = JSON.stringify(draft) !== JSON.stringify(filters);

  return (
    <div className="sticky top-24 flex flex-col gap-6">
      <h2 className="text-sm font-semibold tracking-[0.14em] uppercase">Filter</h2>
      <FilterFields value={draft} onChange={setDraft} idPrefix="side" />
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => apply(draft)} disabled={!changed}>
          Apply
        </Button>
        <Button
          variant="secondary"
          onClick={() => apply({ q: filters.q, sort: filters.sort, availability: "all" })}
          disabled={activeFilterCount(filters) === 0}
        >
          Clear
        </Button>
      </div>
    </div>
  );
}

function FilterFields({
  value,
  onChange,
  idPrefix,
}: {
  value: ProductFilters;
  onChange: (next: ProductFilters) => void;
  idPrefix: string;
}) {
  const { categories } = useCatalog();

  return (
    <div className="flex flex-col gap-7">
      <fieldset>
        <legend className="mb-3 text-sm font-medium">Category</legend>
        <div className="flex flex-wrap gap-2">
          <Chip
            selected={!value.category}
            onClick={() => onChange({ ...value, category: undefined })}
          >
            All
          </Chip>
          {categories.map((category) => (
            <Chip
              key={category.slug}
              selected={value.category === category.slug}
              onClick={() => onChange({ ...value, category: category.slug })}
            >
              {category.name}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-sm font-medium">Size</legend>
        <div className="flex flex-wrap gap-2">
          {SIZES.map((size) => (
            <Chip
              key={size}
              selected={value.size === size}
              onClick={() => onChange({ ...value, size: value.size === size ? undefined : size })}
            >
              {size}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-sm font-medium">Price (₹)</legend>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Min" htmlFor={`${idPrefix}-min`}>
            <Input
              id={`${idPrefix}-min`}
              inputMode="numeric"
              placeholder="0"
              value={value.min_price ?? ""}
              onChange={(event) =>
                onChange({ ...value, min_price: event.target.value.replace(/\D/g, "") || undefined })
              }
            />
          </Field>
          <Field label="Max" htmlFor={`${idPrefix}-max`}>
            <Input
              id={`${idPrefix}-max`}
              inputMode="numeric"
              placeholder="Any"
              value={value.max_price ?? ""}
              onChange={(event) =>
                onChange({ ...value, max_price: event.target.value.replace(/\D/g, "") || undefined })
              }
            />
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-sm font-medium">Availability</legend>
        <div className="flex flex-wrap gap-2">
          {AVAILABILITY_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              selected={(value.availability ?? "all") === option.value}
              onClick={() => onChange({ ...value, availability: option.value })}
            >
              {option.label}
            </Chip>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "h-11 min-w-11 rounded-full border px-4 text-sm transition-colors",
        selected
          ? "border-foreground bg-foreground text-background"
          : "border-border-strong text-foreground hover:border-foreground",
      )}
    >
      {children}
    </button>
  );
}

function FilterIcon() {
  return (
    <svg className="size-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3 5h14M6 10h8M8.5 15h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
