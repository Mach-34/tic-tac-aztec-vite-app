import { LucideIcon, Loader2 } from 'lucide-react';

type ButtonProps = {
  className?: string;
  Icon?: LucideIcon;
  loading?: boolean;
  onClick: () => void;
  text: string;
};

export default function Button({
  className,
  Icon,
  loading,
  onClick,
  text,
}: ButtonProps): JSX.Element {
  const cn = `border border-[#913DE5] bg-[#913DE5] bg-opacity-50 flex items-center gap-2 px-2 py-1 rounded-md text-white ${className}`;

  return (
    <button className={cn} onClick={onClick}>
      {text}
      {loading && <Loader2 className='animate-spin' size={18} />}
      {!loading && Icon && <Icon size={18} />}
    </button>
  );
}
