"use client";

import React, { useRef, useState, useEffect } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface OverflowTooltipProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "content"> {
  content: React.ReactNode;
  children: React.ReactNode;
  tooltipClassName?: string;
}

export function OverflowTooltip({
  content,
  children,
  className,
  tooltipClassName,
  ...props
}: OverflowTooltipProps) {
  const [isOverflowed, setIsOverflowed] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkOverflow = () => {
      const el = textRef.current;
      if (el) {
        // 使用 >= 稍微放宽一点，或者 strictly >
        // 通常 scrollWidth 会比 clientWidth 大才算溢出
        // 有时候可能会有 1px 的误差，但在 truncate 场景下 scrollWidth >> clientWidth
        setIsOverflowed(el.scrollWidth > el.clientWidth);
      }
    };

    const el = textRef.current;
    if (el) {
      // 初始检查
      checkOverflow();

      // 监听尺寸变化
      const observer = new ResizeObserver(checkOverflow);
      observer.observe(el);
      return () => observer.disconnect();
    }
  }, [children]);

  // 复用 div 的样式和属性
  const trigger = (
    <div
      ref={textRef}
      className={cn("truncate", isOverflowed && "cursor-help", className)}
      {...props}
    >
      {children}
    </div>
  );

  if (!isOverflowed) {
    return trigger;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent
        className={cn(
          "max-w-[400px] whitespace-normal break-words bg-popover/95 backdrop-blur-sm",
          tooltipClassName
        )}
      >
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
