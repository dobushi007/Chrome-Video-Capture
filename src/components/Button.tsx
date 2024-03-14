import React from 'react';

interface ButtonProps {
  onClick(): void;
  children?: React.ReactNode;
  className: string;
}

const Button: React.FC<ButtonProps> = ({
  children,
  onClick,
  className,
}: ButtonProps) => {
  return (
    <button
      onClick={onClick}
      className={`p-2 bg-white/[0.15] hover:bg-white/20 border rounded-md border-solid border-[rgba(255,255,255,0.3)] text-center text-[13px] font-bold transition-transform duration-[0.3s] shadow-[1px_1px_20px_rgba(0,0,0,0.1)] backdrop-blur-[30px] ${className}`}
    >
      {children}
    </button>
  );
};

export default Button;
