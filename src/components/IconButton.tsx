import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
};

export const IconButton = forwardRef<HTMLButtonElement, Props>(
  function IconButton(
    { label, title, className = "", type = "button", ...props },
    ref,
  ) {
    return (
      <button
        {...props}
        ref={ref}
        type={type}
        className={`topbar-icon ${className}`}
        aria-label={label}
        title={title || label}
      />
    );
  },
);
