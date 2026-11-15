import type { ReactNode } from "react";

export interface CardProps {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}

export function Card({ title, actions, children, className, id }: CardProps) {
  return (
    <section className={["card", className].filter(Boolean).join(" ")} id={id}>
      {title || actions ? (
        <header className="card__header">
          {title ? <h2 className="card__title">{title}</h2> : <span />}
          {actions ? <div className="row">{actions}</div> : null}
        </header>
      ) : null}
      <div className="card__body">{children}</div>
    </section>
  );
}
