CREATE TABLE public.offerings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  category text NOT NULL DEFAULT 'smartplaques',
  short_description text NOT NULL DEFAULT '',
  full_description text,
  image_url text,
  icon text,
  active boolean NOT NULL DEFAULT true,
  featured boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  cta_label text NOT NULL DEFAULT 'I''m interested',
  starting_price_text text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.offerings TO anon;
GRANT SELECT ON public.offerings TO authenticated;
GRANT ALL ON public.offerings TO service_role;

ALTER TABLE public.offerings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active offerings are public" ON public.offerings
  FOR SELECT TO anon, authenticated USING (active = true);

CREATE TRIGGER offerings_touch BEFORE UPDATE ON public.offerings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.offering_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid REFERENCES public.offerings(id) ON DELETE SET NULL,
  user_id uuid,
  business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  preferred_contact_method text NOT NULL DEFAULT 'email',
  business_name text,
  business_address text,
  google_place_id text,
  quantity_interest text,
  message text,
  source text NOT NULL DEFAULT 'website',
  status text NOT NULL DEFAULT 'new',
  assigned_admin_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  contacted_at timestamptz,
  closed_at timestamptz,
  CONSTRAINT offering_inquiries_status_check CHECK (status IN ('new','contacted','qualified','follow_up','won','not_interested','closed')),
  CONSTRAINT offering_inquiries_contact_check CHECK (preferred_contact_method IN ('email','phone','text'))
);

CREATE INDEX offering_inquiries_status_idx ON public.offering_inquiries (status, created_at DESC);

GRANT INSERT ON public.offering_inquiries TO anon;
GRANT INSERT ON public.offering_inquiries TO authenticated;
GRANT ALL ON public.offering_inquiries TO service_role;

ALTER TABLE public.offering_inquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone may submit an inquiry" ON public.offering_inquiries
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE TRIGGER offering_inquiries_touch BEFORE UPDATE ON public.offering_inquiries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.offerings (name, slug, category, short_description, full_description, icon, featured, sort_order, cta_label, metadata) VALUES
('Google Review SmartPlaque','google-review-smartplaque','smartplaques','A tap sends customers straight to your Google review page.','A countertop plaque with NFC and a QR code built in. Customers tap their phone and land on your Google review page — no app, no typing. Every tap is counted so you can see what the plaque is doing for you.','star',true,10,'I''m interested','{"styles":["Cloud White","Light Smoke","Premium Black Marble"],"bases":["Clear Acrylic","Weighted Metal"],"physical":true}'),
('Instagram SmartPlaque','instagram-smartplaque','smartplaques','Send customers straight to your Instagram.','A plaque for businesses that grow on Instagram. One tap opens your profile so the people already in your space can follow you before they leave.','instagram',true,20,'I''m interested','{"styles":["Cloud White","Light Smoke","Premium Black Marble"],"bases":["Clear Acrylic","Weighted Metal"],"physical":true}'),
('Universal SmartPlaque','universal-smartplaque','smartplaques','One plaque, any destination — and you can change it any time.','Powered by TapLocal SmartLinks. Point it at reviews, social, your menu, your website, bookings or anywhere else, and change where it sends people from your portal without touching the plaque.','link',true,30,'I''m interested','{"styles":["Cloud White","Light Smoke","Premium Black Marble"],"bases":["Clear Acrylic","Weighted Metal"],"physical":true}'),
('2 SmartPlaque Pack','smartplaque-pack-2','packages','Two plaques for two spots — each with its own identity.','Every physical plaque has its own unique TapLocal identity and its own analytics, so you can see which spot actually earns the taps.','layers',false,40,'Get pack pricing','{"physical":true,"quantity":2}'),
('4 SmartPlaque Pack','smartplaque-pack-4','packages','Four plaques to cover a full room or several tables.','Every physical plaque has its own unique TapLocal identity and its own analytics, so you can compare placements side by side.','layers',false,50,'Get pack pricing','{"physical":true,"quantity":4}'),
('Custom Business Pack','custom-business-pack','packages','A pack sized and configured around your business.','Tell us how many spots you want covered and where each one should send people. We''ll put together a pack that fits.','package',false,60,'Get pack pricing','{"physical":true}'),
('Custom TapLocal Plaque','custom-taplocal-plaque','custom','Your branding, your design, your action.','For businesses that want the plaque to look like theirs: custom branding, a business-specific design and a custom destination or action.','sparkles',true,70,'Request custom plaque','{"physical":true}'),
('Managed TapLocal Setup','managed-taplocal-setup','services','We set everything up for you.','We handle the setup end to end: finding your business listing, programming your plaques, choosing destinations and getting you into your portal.','settings',false,80,'Talk to TapLocal','{"physical":false}');