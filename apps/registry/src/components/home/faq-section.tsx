import { HelpCircle } from 'lucide-react';
import { motion } from 'motion/react';

import { faqItems } from '~/consts/homepage';

export function FaqSection() {
  return (
    <section id="faq" className="relative z-[1] border-t border-border" aria-label="FAQ">
      <div className="mx-auto max-w-[1000px] px-4 sm:px-6 lg:px-8 py-20">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3 }}>
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-sm bg-tank/10 border border-tank/12 mb-4">
            <HelpCircle className="w-5 h-5 text-tank" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-tight mb-3">
            Frequently Asked <span className="text-tank">Questions</span>
          </h2>
        </motion.div>
        <div className="max-w-[700px] mx-auto space-y-4">
          {faqItems.map((item, i) => (
            <motion.div
              key={item.question}
              className="rounded border border-border bg-card/30 p-5"
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05, duration: 0.2 }}>
              <h3 className="text-[15px] font-bold tracking-tight mb-2">{item.question}</h3>
              <p className="text-[13px] text-muted-foreground leading-relaxed">{item.answer}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
