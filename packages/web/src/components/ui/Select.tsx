import { useId, type SelectHTMLAttributes } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: ReadonlyArray<SelectOption>;
  placeholder?: string;
  hint?: string;
  error?: string;
}

export function Select({
  label,
  options,
  placeholder,
  hint,
  error,
  id,
  className,
  ...rest
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  return (
    <div className="field">
      <label className="field__label" htmlFor={selectId}>
        {label}
      </label>
      <select
        id={selectId}
        className={["select", error ? "select--invalid" : "", className]
          .filter(Boolean)
          .join(" ")}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined}
        {...rest}
      >
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && !error ? (
        <span className="field__hint" id={`${selectId}-hint`}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="field__error" id={`${selectId}-error`} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
