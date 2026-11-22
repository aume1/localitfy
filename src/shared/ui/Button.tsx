import { forwardRef } from "react";
import "./controls.css";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "primary"
    | "ghost"
    | "secondary"
    | "outline"
    | "glass"
    | "glass-primary"
    | "glass-action";
  size?: "default" | "sm" | "lg" | "icon";
}

const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "ltButtonPrimary", secondary: "ltButtonSecondary", outline: "ltButtonOutline",
  ghost: "ltButtonGhost", glass: "ltButtonGlass", "glass-primary": "ltButtonPrimary",
  "glass-action": "ltButtonGlass",
};
const sizeClasses: Record<NonNullable<ButtonProps["size"]>, string> = {
  default: "ltButtonDefault", sm: "ltButtonSmall", lg: "ltButtonLarge", icon: "ltButtonIcon",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "default",
      className = "",
      children,
      type = "button",
      ...rest
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      className={`ltButton ${variantClasses[variant]} ${sizeClasses[size]} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  ),
);

Button.displayName = "Button";

export default Button;
