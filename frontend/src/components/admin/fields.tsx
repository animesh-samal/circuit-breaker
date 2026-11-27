import { useEffect, useId, useState, type ReactNode } from "react";

/* Small form pieces shared by every editor in the admin panel. Each one is a
   plain controlled input with a real <label>, so the form works with a keyboard
   and a screen reader and nothing here needs a library. The length limits match
   the API's, so a field stops accepting text at the point the server would refuse
   it, instead of failing on save. */

export function arrayMove<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  if (item === undefined) return list;
  next.splice(to, 0, item);
  return next;
}

interface FieldProps {
  label: string;
  hint?: string;
  children: (id: string) => ReactNode;
}

export function Field({ label, hint, children }: FieldProps) {
  const id = useId();
  return (
    <div className="adm-field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <p className="adm-hint">{hint}</p>}
    </div>
  );
}

interface TextProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  max?: number;
  hint?: string;
  placeholder?: string;
  required?: boolean;
}

export function TextInput({ label, value, onChange, max, hint, placeholder, required }: TextProps) {
  return (
    <Field label={label} {...(hint ? { hint } : {})}>
      {(id) => (
        <input
          id={id}
          type="text"
          value={value}
          maxLength={max}
          placeholder={placeholder}
          required={required}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

export function TextArea({ label, value, onChange, max, hint, rows = 3 }: TextProps & { rows?: number }) {
  return (
    <Field label={label} {...(hint ? { hint } : {})}>
      {(id) => <textarea id={id} value={value} rows={rows} maxLength={max} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

const parseChips = (text: string): string[] =>
  text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

/* A list of short tags typed as "Python, Terraform, AWS". The raw text is kept
   while typing, so a trailing comma is not eaten; it is replaced from outside
   only when the list changes some other way, such as restoring a version. */
export function ChipsInput({
  label,
  values,
  onChange,
  hint,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  hint?: string;
}) {
  const [text, setText] = useState(values.join(", "));

  useEffect(() => {
    if (parseChips(text).join("\u0000") !== values.join("\u0000")) setText(values.join(", "));
    // Only when the list itself changes; `text` is the thing being typed.
  }, [values]);

  return (
    <Field label={label} hint={hint ?? "Separate with commas."}>
      {(id) => (
        <input
          id={id}
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onChange(parseChips(e.target.value));
          }}
        />
      )}
    </Field>
  );
}

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="adm-check">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>{label}</label>
    </div>
  );
}

interface RowButtonsProps {
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onRemove: () => void;
  canRemove?: boolean;
  noun: string;
}

/* Up, down and remove for one row of a list. */
export function RowButtons({ index, count, onMove, onRemove, canRemove = true, noun }: RowButtonsProps) {
  return (
    <div className="adm-row-buttons">
      <button type="button" className="adm-mini" disabled={index === 0} onClick={() => onMove(index, index - 1)} aria-label={`Move ${noun} up`}>
        ↑
      </button>
      <button type="button" className="adm-mini" disabled={index === count - 1} onClick={() => onMove(index, index + 1)} aria-label={`Move ${noun} down`}>
        ↓
      </button>
      <button type="button" className="adm-mini adm-mini--danger" disabled={!canRemove} onClick={onRemove} aria-label={`Remove ${noun}`}>
        Remove
      </button>
    </div>
  );
}

export function AddButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" className="btn btn-ghost adm-add" onClick={onClick} disabled={disabled}>
      + {children}
    </button>
  );
}

/* A list of sentences, one box each, with add, move and remove. */
export function StringList({
  label,
  values,
  onChange,
  max,
  itemMax = 1500,
  noun,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  max: number;
  itemMax?: number;
  noun: string;
}) {
  return (
    <fieldset className="adm-group">
      <legend>{label}</legend>
      {values.map((value, i) => (
        <div className="adm-list-row" key={i}>
          <TextArea
            label={`${noun} ${i + 1}`}
            value={value}
            max={itemMax}
            rows={3}
            onChange={(v) => onChange(values.map((x, j) => (j === i ? v : x)))}
          />
          <RowButtons
            index={i}
            count={values.length}
            noun={`${noun} ${i + 1}`}
            canRemove={values.length > 1}
            onMove={(from, to) => onChange(arrayMove(values, from, to))}
            onRemove={() => onChange(values.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      <AddButton disabled={values.length >= max} onClick={() => onChange([...values, ""])}>
        Add {noun.toLowerCase()}
      </AddButton>
    </fieldset>
  );
}
