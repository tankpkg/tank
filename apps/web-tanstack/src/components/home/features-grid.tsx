import { Shield } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { features } from '~/consts/homepage';

export function FeaturesGrid() {
  return (
    <section className="container mx-auto px-4 pb-16 md:pb-24">
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded bg-tank/10 border border-tank/20 mb-4">
          <Shield className="w-6 h-6 text-tank" />
        </div>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
          Security at <span className="text-tank">every layer</span>
        </h2>
        <p className="text-muted-foreground max-w-xl mx-auto">
          From publish to install — every skill is scanned, scored, and verified.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
        {features.map((feature) => (
          <Card key={feature.title} className="tank-card bg-card/50 backdrop-blur-sm hover:bg-card/80 group">
            <CardHeader>
              <div className="inline-flex h-10 w-10 items-center justify-center rounded bg-tank/10 border border-tank/20 mb-3 group-hover:bg-tank/20 transition-colors">
                <feature.icon className="h-5 w-5 text-tank" />
              </div>
              <CardTitle className="text-base">{feature.title}</CardTitle>
            </CardHeader>
            <CardContent className="-mt-2">
              <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
