"use client";

import type { ComponentProps } from "react";

/** A form that asks before submitting. For void, cancel, delete, and other one-way actions. */
export function ConfirmForm({ message, ...props }: ComponentProps<"form"> & { message: string }) {
  return (
    <form
      {...props}
      onSubmit={(e) => {
        if (!window.confirm(message)) e.preventDefault();
        props.onSubmit?.(e);
      }}
    />
  );
}
