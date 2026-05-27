import React from "react";
import Link from "next/link";

import type { ErrorStateVariant } from "@/lib/error-states";
import { getErrorStateContent } from "@/lib/error-states";

export function ServerErrorState({
  variant = "backend-unavailable",
  title,
  detail,
  primaryActionHref,
  primaryActionLabel = "Go to projects",
  secondaryActionHref,
  secondaryActionLabel,
}: {
  variant?: ErrorStateVariant;
  title?: string;
  detail?: string;
  primaryActionHref?: string;
  primaryActionLabel?: string;
  secondaryActionHref?: string;
  secondaryActionLabel?: string;
}) {
  const content = getErrorStateContent(variant);

  return (
    <section className="panel stack error-panel">
      <p className="eyebrow">{content.eyebrow}</p>
      <h1>{title || content.title}</h1>
      <p className="lede">{detail || content.detail}</p>
      {(primaryActionHref || secondaryActionHref) && (
        <div className="inline-actions">
          {primaryActionHref ? (
            <Link className="primary text-link" href={primaryActionHref}>
              {primaryActionLabel}
            </Link>
          ) : null}
          {secondaryActionHref && secondaryActionLabel ? (
            <Link className="secondary text-link" href={secondaryActionHref}>
              {secondaryActionLabel}
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}
