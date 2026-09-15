import { InputHTMLAttributes, ButtonHTMLAttributes } from "react";

/** Campo de texto padrão do projeto: preenchido em `slate-100`, sem borda, cantos
 * arredondados. Usar em toda tela nova em vez de estilizar um `<input>` na mão, pra
 * manter o padrão visual definido na tela de login. */
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return (
    <input
      {...rest}
      className={[
        "block w-full rounded-lg border-0 bg-slate-100 px-4 py-3 text-sm text-slate-900",
        "placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

/** Botão padrão do projeto. `primary` (default) = pill escuro cheio, pras ações
 * principais (Entrar, Salvar). `secondary` = contorno, pras alternativas. */
export function Button({ variant = "primary", className, ...rest }: ButtonProps) {
  const base = "rounded-full px-6 py-2.5 text-sm font-medium transition disabled:opacity-50";
  const variantClasses =
    variant === "primary"
      ? "bg-slate-900 text-white hover:bg-slate-800"
      : "border border-slate-300 text-slate-900 hover:border-slate-400 hover:bg-slate-50";
  return (
    <button {...rest} className={[base, variantClasses, className].filter(Boolean).join(" ")} />
  );
}
