interface BadgeProps {
  text: string;
  className: string;
}

export function Badge({ text, className }: BadgeProps) {
  return <span className={`px-2 py-1 rounded-full ${className}`}>{text}</span>;
}
