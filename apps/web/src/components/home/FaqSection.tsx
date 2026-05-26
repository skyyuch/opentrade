'use client';

import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

import type { ReactNode } from 'react';

type FaqItem = {
  question: string;
  answer: string;
};

type FaqSectionProps = {
  title: string;
  subtitle: string;
  items: FaqItem[];
};

export const FaqSection = ({ title, subtitle, items }: FaqSectionProps): ReactNode => {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  return (
    <section className="relative z-10 border-t border-white/5">
      <div className="mx-auto max-w-4xl px-6 py-24 lg:px-10">
        <div className="mb-12 text-center">
          <h2 className="mb-4 text-3xl font-bold">{title}</h2>
          <p className="text-white/50">{subtitle}</p>
        </div>

        <div className="space-y-4">
          {items.map((faq, idx) => (
            <div
              key={idx}
              className="overflow-hidden rounded-2xl border border-white/10 bg-white/5"
            >
              <button
                onClick={() => setActiveIdx(activeIdx === idx ? null : idx)}
                className="flex w-full items-center justify-between px-6 py-5 text-left font-bold transition-colors hover:bg-white/5"
              >
                <span className="pr-4">{faq.question}</span>
                <ChevronRight
                  size={20}
                  className={`shrink-0 text-white/40 transition-transform ${activeIdx === idx ? 'rotate-90' : ''}`}
                />
              </button>
              {activeIdx === idx && (
                <div className="bg-black/20 px-6 pb-6 text-sm leading-relaxed text-white/60">
                  {faq.answer}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
