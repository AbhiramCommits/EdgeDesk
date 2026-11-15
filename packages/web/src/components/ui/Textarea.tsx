import { useId, type TextareaHTMLAttributes } from "react";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function Textarea({ label, hint, error, id, className, ...rest }: TextareaProps) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  return (
    <div className="field">
      <label className="field__label" htmlFor={textareaId}>
        {label}
      </label>
      <textarea
        id={textareaId}
        className={["textarea", error ? "textarea--invalid" : "", className]
          .filter(Boolean)
          .join(" ")}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${textareaId}-error` : hint ? `${textareaId}-hint` : undefined}
        {...rest}
      />
      {hint && !error ? (
        <span className="field__hint" id={`${textareaId}-hint`}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="field__error" id={`${textareaId}-error`} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
