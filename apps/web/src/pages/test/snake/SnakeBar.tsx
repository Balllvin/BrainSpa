import type { ReactNode } from "react";

export function SnakeBar({ children }: { children: ReactNode }) {
  return <div className="snake-bar">{children}</div>;
}

export function SnakeBarGroup({ children }: { children: ReactNode }) {
  return <div className="snake-bar-group">{children}</div>;
}

export function SnakeBarBtn({
  children,
  active,
  disabled,
  onClick,
  title,
}: {
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`snake-bar-btn${active ? " is-active" : ""}`}
      disabled={disabled}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}

export function SnakeBarSegment<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="snake-bar-segment" role="group">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`snake-bar-segment-btn${value === option.value ? " is-active" : ""}`}
          disabled={disabled}
          title={option.title ?? option.label}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function SnakeTelemetry({ children }: { children: ReactNode }) {
  return <p className="snake-telemetry">{children}</p>;
}