"use client";

import Image from "next/image";
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface Photo {
  id: string;
  url: string;
}

interface Props {
  photos: Photo[];
}

export function VacancyGallery({ photos }: Props) {
  const [active, setActive] = useState<Photo | null>(null);
  if (photos.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold tracking-tight sm:text-xl">Fotos</h2>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {photos.map((photo) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => setActive(photo)}
            className="group relative aspect-square overflow-hidden rounded-xl bg-muted ring-1 ring-black/5"
            aria-label="Ver foto"
          >
            <Image
              src={photo.url}
              alt=""
              fill
              loading="lazy"
              sizes="(max-width: 768px) 33vw, 256px"
              className="object-cover transition duration-300 group-hover:scale-105"
            />
          </button>
        ))}
      </div>

      <Dialog open={active !== null} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent className="max-w-4xl border-0 bg-transparent p-0 shadow-none">
          <DialogTitle className="sr-only">Foto</DialogTitle>
          {active ? (
            <div className="relative aspect-[4/3] w-full">
              <Image
                src={active.url}
                alt=""
                fill
                sizes="(max-width: 768px) 100vw, 1024px"
                className="object-contain"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
