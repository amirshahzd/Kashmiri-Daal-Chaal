import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Clock, Phone, Star } from 'lucide-react';
import { BRANCH, OFFERS, REVIEWS } from '@/lib/data';
import { MenuBanner } from '@/components/MenuBanner';
import { FeaturedPlates } from '@/components/FeaturedPlates';
import { RiceRain3D } from '@/components/RiceRain3D';
import { Image3D } from '@/components/Image3D';
import { OrderPlacedNotice } from '@/components/OrderPlacedNotice';

export default function HomePage() {
  return (
    <div>
      <OrderPlacedNotice />
      {/* Full-bleed hero — brand first */}
      <section className="relative min-h-[100svh] w-full overflow-hidden">
        <Image3D variant="hero" className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1756821753095-64134f5c0c5c?auto=format&fit=crop&w=2000&q=80"
            alt="Boiled rice with daal on top"
            fill
            priority
            className="object-cover object-center"
            sizes="100vw"
          />
        </Image3D>
        <div className="kdc-hero-overlay absolute inset-0 z-[1]" />
        <div className="absolute inset-0 z-[2]">
          <RiceRain3D density={56} />
        </div>
        <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-7xl flex-col justify-end px-4 pb-16 pt-28 md:px-6 md:pb-24">
          <p className="animate-rise gold-text font-[family-name:var(--font-display)] text-5xl leading-none md:text-7xl lg:text-8xl">
            Kashmiri Daal Chawal
          </p>
          <h1 className="animate-rise-delay mt-5 max-w-xl font-[family-name:var(--font-display)] text-2xl text-white md:text-4xl">
            Kashmiri comfort, plated with warmth.
          </h1>
          <p className="animate-rise-delay mt-4 max-w-lg text-base text-white/80 md:text-lg">
            Eat in · Take away · Delivery — daal, rice, biryani and kebabs from Hall Road, Lahore.
          </p>
          <div className="animate-rise-delay mt-8 flex flex-wrap gap-3">
            <Link href="/menu" className="kdc-button kdc-button-gold" data-tooltip="Menu" title="Menu">
              View Menu
            </Link>
            <Link href="/order" className="kdc-button kdc-button-ghost" data-tooltip="Order" title="Order">
              Order Now
            </Link>
          </div>
        </div>
      </section>

      <MenuBanner />

      {/* Story */}
      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-20 md:grid-cols-2 md:px-6 md:py-28">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">Our story</p>
          <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl text-ink md:text-5xl">
            From Kashmiri kitchens to Hall Road, Lahore.
          </h2>
        </div>
        <div className="space-y-4 text-muted md:pt-8">
          <p>
            Kashmiri Daal Chawal began with a simple promise: honest food that tastes of home.
            Basmati steamed until every grain is separate, daal tempered slowly, biryani layered with
            saffron and patience.
          </p>
          <p>
            Whether you dine with us, collect take away from Hall Road, Lahore, Pakistan, or order
            through Foodpanda, Bykea, Careem — or directly here — the plate arrives the way it
            should.
          </p>
        </div>
      </section>

      <FeaturedPlates />

      {/* Offers */}
      <section className="border-y border-[var(--kdc-border)] bg-crimson-deep py-16 text-white">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">Latest offers</p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Save on your next order</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {OFFERS.map((o) => (
              <div key={o.code} className="rounded-2xl border border-white/15 bg-white/5 p-6 backdrop-blur">
                <p className="font-mono text-sm text-gold">{o.code}</p>
                <p className="mt-2 text-xl font-semibold">{o.title}</p>
                <p className="mt-1 text-white/70">{o.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Reviews */}
      <section className="mx-auto max-w-7xl px-4 py-20 md:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">Guest words</p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-ink">
          Loved across Lahore
        </h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {REVIEWS.map((r) => (
            <blockquote
              key={r.id}
              className="rounded-2xl border border-[var(--kdc-border)] bg-surface p-6"
            >
              <div className="flex gap-1 text-gold">
                {Array.from({ length: r.rating }).map((_, i) => (
                  <Star key={i} size={16} fill="currentColor" />
                ))}
              </div>
              <p className="mt-4 font-[family-name:var(--font-display)] text-xl text-ink">{r.title}</p>
              <p className="mt-2 text-sm text-muted">&ldquo;{r.comment}&rdquo;</p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-crimson">{r.name}</p>
            </blockquote>
          ))}
        </div>
      </section>

      {/* Contact / hours / map */}
      <section className="mx-auto grid max-w-7xl gap-8 px-4 pb-24 md:grid-cols-2 md:px-6">
        <div className="space-y-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">Find us</p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-ink">
              Opening hours & contact
            </h2>
          </div>
          <ul className="space-y-3 text-sm text-muted">
            <li className="flex items-start gap-3">
              <MapPin className="mt-0.5 text-crimson" size={18} />
              {BRANCH.address}
            </li>
            <li className="flex items-start gap-3">
              <Phone className="mt-0.5 text-crimson" size={18} />
              {BRANCH.phone}
            </li>
            <li className="flex items-start gap-3">
              <Clock className="mt-0.5 text-crimson" size={18} />
              <span className="space-y-1">
                {BRANCH.hours.map((h) => (
                  <span key={h.day} className="block">
                    {h.day}: {h.hours}
                  </span>
                ))}
              </span>
            </li>
          </ul>
          <div className="flex flex-wrap gap-3">
            <Link href="/order" className="kdc-button kdc-button-primary">
              Order on website
            </Link>
            <a
              href="https://www.foodpanda.pk"
              target="_blank"
              rel="noreferrer"
              className="kdc-button border border-crimson/30 text-crimson"
            >
              Foodpanda
            </a>
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-[var(--kdc-border)] shadow-lg">
          <iframe
            title="Kashmiri Daal Chawal location"
            src={BRANCH.mapEmbed}
            className="h-[360px] w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </section>
    </div>
  );
}
