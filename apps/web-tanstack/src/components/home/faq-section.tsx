import { HelpCircle } from 'lucide-react';

import { faqItems } from '~/consts/homepage';

export function FaqSection() {
  return (
    <section className="container mx-auto px-4 py-16 md:py-24">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded bg-tank/10 border border-tank/20 mb-4">
            <HelpCircle className="w-6 h-6 text-tank" />
          </div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
            Frequently Asked <span className="text-tank">Questions</span>
          </h2>
        </div>
        <div className="space-y-6">
          {faqItems.map((item) => (
            <div key={item.question} className="border border-tank/10 rounded p-5 bg-card/30">
              <h3 className="font-semibold text-base mb-2">{item.question}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{item.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
