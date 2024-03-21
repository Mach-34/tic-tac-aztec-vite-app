import { LucideIcon } from 'lucide-react';

type ButtonProps = {
  className?: string;
  Icon?: LucideIcon;
  onClick: () => void;
  text: string;
};

export default function Button({
  className,
  Icon,
  onClick,
  text,
}: ButtonProps): JSX.Element {
  const cn = `bg-[#2D2047] flex items-center gap-2 px-2 py-1 rounded-md text-white ${className}`;

  return (
    <button className={cn} onClick={onClick}>
      {text}
      {Icon && <Icon size={18} />}
    </button>
  );
}
