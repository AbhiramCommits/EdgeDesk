export interface SpinnerProps {
  size?: "sm" | "lg";
  label?: string;
}

export function Spinner({ size = "sm", label = "Loading" }: SpinnerProps) {
  return (
    <span
      className={size === "lg" ? "spinner spinner--lg" : "spinner"}
      role="status"
      aria-label={label}
    />
  );
}
