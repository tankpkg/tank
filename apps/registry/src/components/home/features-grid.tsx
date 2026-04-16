import { Shield } from 'lucide-react';
import { motion } from 'motion/react';

import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { features } from '~/consts/homepage';

export function FeaturesGrid() {
  return (
    <section className="relative z-[1] border-t border-border" aria-label="Security features">
      <div className="mx-auto max-w-[1000px] px-4 sm:px-6 lg:px-8 py-20">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3 }}>
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-sm bg-tank/10 border border-tank/12 mb-4">
            <Shield className="w-5 h-5 text-tank" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-tight mb-3">
            Security at <span className="text-tank">every layer</span>
          </h2>
          <p className="text-muted-foreground text-[15px]">
            From publish to install — every package is scanned, scored, and verified.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06, duration: 0.25 }}>
              <Card className="bg-card/30 border-border hover:bg-card/50 transition-colors group h-full">
                <CardHeader>
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-sm bg-tank/10 border border-tank/12 mb-3 group-hover:bg-tank/15 transition-colors">
                    <feature.icon className="h-4 w-4 text-tank" />
                  </div>
                  <CardTitle className="text-[15px] font-bold tracking-tight">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent className="-mt-2">
                  <p className="text-[13px] text-muted-foreground leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
