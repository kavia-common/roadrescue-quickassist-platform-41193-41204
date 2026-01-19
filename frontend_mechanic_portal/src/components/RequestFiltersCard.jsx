import React, { useEffect, useMemo, useState } from "react";
import { Card } from "./ui/Card";
import { Input } from "./ui/Input";
import { Button } from "./ui/Button";
import { useDebouncedValue } from "../hooks/useDebouncedValue";

const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "open", label: "Open" },
  { value: "assigned", label: "Assigned" },
  { value: "completed", label: "Completed" },
  { value: "canceled", label: "Canceled" },
];

// PUBLIC_INTERFACE
export function RequestFiltersCard({
  title = "Filters",
  subtitle = "Filter requests by location, issue description, and status.",
  filters,
  onFiltersChange,
  onClear,
  storageKey,
}) {
  /** Filter controls for request lists (supports debounced text inputs + status select). */
  const [draft, setDraft] = useState(() => ({
    location: filters?.location || "",
    issue: filters?.issue || "",
    status: filters?.status || "",
  }));

  // If parent updates (e.g., restored from localStorage), keep draft in sync.
  useEffect(() => {
    setDraft({
      location: filters?.location || "",
      issue: filters?.issue || "",
      status: filters?.status || "",
    });
  }, [filters?.location, filters?.issue, filters?.status]);

  const debouncedLocation = useDebouncedValue(draft.location, 250);
  const debouncedIssue = useDebouncedValue(draft.issue, 250);

  // Emit changes to parent with debounced text fields.
  useEffect(() => {
    onFiltersChange?.({
      location: debouncedLocation,
      issue: debouncedIssue,
      status: draft.status,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedLocation, debouncedIssue, draft.status]);

  const hasAny = useMemo(() => {
    return Boolean((filters?.location || "").trim() || (filters?.issue || "").trim() || (filters?.status || "").trim());
  }, [filters?.issue, filters?.location, filters?.status]);

  return (
    <Card
      title={title}
      subtitle={subtitle}
      actions={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setDraft({ location: "", issue: "", status: "" });
            onClear?.();
          }}
          disabled={!hasAny}
        >
          Clear filters
        </Button>
      }
    >
      <div className="grid2" style={{ alignItems: "end" }}>
        <Input
          label="Location (contains)"
          name={storageKey ? `${storageKey}.location` : "filterLocation"}
          value={draft.location}
          onChange={(e) => setDraft((p) => ({ ...p, location: e.target.value }))}
          placeholder="e.g., Downtown"
        />
        <Input
          label="Issue description (contains)"
          name={storageKey ? `${storageKey}.issue` : "filterIssue"}
          value={draft.issue}
          onChange={(e) => setDraft((p) => ({ ...p, issue: e.target.value }))}
          placeholder="e.g., battery"
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12, marginTop: 12 }}>
        <div className="field">
          <label className="label" htmlFor={storageKey ? `${storageKey}.status` : "filterStatus"}>
            Status
          </label>
          <select
            id={storageKey ? `${storageKey}.status` : "filterStatus"}
            className="input"
            value={draft.status}
            onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value }))}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value || "any"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="hint">Filters are combinable. Text filters are case-insensitive.</div>
        </div>
      </div>
    </Card>
  );
}
