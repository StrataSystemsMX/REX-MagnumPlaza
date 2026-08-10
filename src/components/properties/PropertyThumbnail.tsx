import { ImageOff } from "lucide-react";
import Image from "next/image";
import { cn } from "@/shared/utils";

interface PropertyThumbnailProps {
  url: string | null;
  alt: string;
  size?: number;
  className?: string;
}

export function PropertyThumbnail({
  url,
  alt,
  size = 48,
  className,
}: PropertyThumbnailProps) {
  if (!url) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-md bg-muted text-muted-foreground",
          className,
        )}
        style={{ width: size, height: size }}
        aria-label="Sin foto"
      >
        <ImageOff className="size-4" />
      </div>
    );
  }
  return (
    <div
      className={cn("relative overflow-hidden rounded-md bg-muted", className)}
      style={{ width: size, height: size }}
    >
      <Image
        src={url}
        alt={alt}
        fill
        sizes={`${size}px`}
        loading="lazy"
        className="object-cover"
      />
    </div>
  );
}
