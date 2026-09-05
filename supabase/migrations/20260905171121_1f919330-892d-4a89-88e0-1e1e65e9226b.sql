with img(k,u) as (values
 ('google','/__l5e/assets-v1/9903044b-ac72-471b-ac0d-ab3af6e1b845/plaque-google.jpg'),
 ('insta','/__l5e/assets-v1/10a98cad-bf1b-4399-aa2e-7915b622810a/plaque-instagram.jpg'),
 ('uni','/__l5e/assets-v1/d20a82df-b9df-4420-af21-e39594d39138/plaque-universal.jpg'),
 ('p2','/__l5e/assets-v1/258b7b3f-f71e-4d9f-bea3-1c1816fd48d5/pack-2.jpg'),
 ('p4','/__l5e/assets-v1/38b7d6fe-4dd7-4c5f-8312-19c3823ded6d/pack-4.jpg'),
 ('multi','/__l5e/assets-v1/427eb2bf-bcf7-40ac-9df7-47ee7986c3d8/pack-multilocation.jpg'),
 ('pcust','/__l5e/assets-v1/83848a1a-c515-4348-9c24-38c705e584d1/pack-custom.jpg'),
 ('brand','/__l5e/assets-v1/8f97403b-545c-44b7-8f43-5d93e07ac36c/plaque-custom-branded.jpg'),
 ('portal','/__l5e/assets-v1/0e11bffb-ebdd-4fc8-998f-49a971999d80/portal.jpg'),
 ('anat','/__l5e/assets-v1/693ec3ab-112d-4f65-b3e4-a63d8d076db9/anatomy.jpg'),
 ('fw','/__l5e/assets-v1/f6d28b94-7343-4b9c-9892-66487fa80da3/finish-cloud-white.jpg'),
 ('fs','/__l5e/assets-v1/85bc531e-4051-4c39-b3fc-2cd63efeb5a5/finish-light-smoke.jpg'),
 ('fb','/__l5e/assets-v1/92cbe9fc-693f-46df-a7a2-9963d6ba2366/finish-black-marble.jpg'),
 ('fp','/__l5e/assets-v1/ee938413-d8c7-4414-baa7-3e20ad489646/finish-soft-pink.jpg'),
 ('bc','/__l5e/assets-v1/282695a5-e164-49b2-a3e9-d6dcd1c77621/base-clear-acrylic.jpg'),
 ('bm','/__l5e/assets-v1/5ae02b9e-65b2-4aac-bd0b-5cc775e39023/base-weighted-metal.jpg')
), m as (select jsonb_object_agg(k,u) v from img),
parts as (
 select
  jsonb_build_array(
   jsonb_build_object('name','Clear Acrylic','image',v->>'bc'),
   jsonb_build_object('name','Weighted Metal','image',v->>'bm')) as bases,
  jsonb_build_array(
   jsonb_build_object('name','Cloud White','image',v->>'fw'),
   jsonb_build_object('name','Light Smoke','image',v->>'fs'),
   jsonb_build_object('name','Black Marble','image',v->>'fb')) as fin,
  jsonb_build_array(
   jsonb_build_object('name','Soft Pink','image',v->>'fp'),
   jsonb_build_object('name','Cloud White','image',v->>'fw'),
   jsonb_build_object('name','Black Marble','image',v->>'fb')) as fin_ig,
  jsonb_build_array(
   jsonb_build_object('name','Cloud White','image',v->>'fw'),
   jsonb_build_object('name','Light Smoke','image',v->>'fs'),
   jsonb_build_object('name','Black Marble','image',v->>'fb'),
   jsonb_build_object('name','Soft Pink','image',v->>'fp')) as fin_all,
  v
 from m
), rows as (
 select * from (values
  ('google-review-smartplaque','Google Review SmartPlaque','smartplaques',10,true,'I''m interested',
   'A preprogrammed NFC + QR plaque that sends customers straight to your Google review page.',
   'A preprogrammed NFC + QR plaque that sends customers to your business''s Google review destination through a TapLocal SmartLink. Customers tap their phone on the plaque — no app, no typing. You can change where it points later without replacing the plaque.'),
  ('instagram-smartplaque','Instagram SmartPlaque','smartplaques',20,true,'I''m interested',
   'Give customers a one-tap path to your Instagram profile or campaign.',
   'A soft pink acrylic plaque that opens your Instagram profile, a campaign page or a link in bio in one tap. Every plaque has its own TapLocal identity, so engagement is tracked and the destination can change at any time.'),
  ('universal-smartplaque','Universal SmartPlaque','smartplaques',30,true,'I''m interested',
   'One plaque that can point to whatever action matters most today.',
   'One physical plaque that can point to whatever action matters to the business — Google reviews, Instagram, your website, a menu, booking, offers, contact details or a custom link. Change the destination later without replacing the physical plaque.'),
  ('smartplaque-pack-2','2-Plaque Business Pack','packages',40,false,'Get pack pricing',
   'Two plaques, two placements — each measured separately.',
   'Two SmartPlaques for one business. Each plaque still gets its own unique TapLocal SmartLink, so you can see which physical placement actually gets used. Good for front counter and entrance, counter and table, or reception and checkout.'),
  ('smartplaque-pack-4','4-Plaque Business Pack','packages',50,false,'I''m interested',
   'Four plaques for busier rooms, each tracked on its own.',
   'Four SmartPlaques for one business — front counter, table or waiting area, entrance, and checkout or reception. Each plaque is measured separately so you can see which placement gets used.'),
  ('multi-location-pack','Multi-Location Pack','packages',60,false,'Talk to TapLocal',
   'Plaques for every store, all under one TapLocal account.',
   'For businesses with two or more locations — restaurants, salons, clinics, hotels and service locations. Each location can have its own plaques and its own activity, all under one TapLocal account.'),
  ('custom-business-pack','Custom Business Pack','packages',70,false,'Request a custom setup',
   'Built around your rooms, your artwork and your destinations.',
   'A pack put together for your business: custom plaque artwork, however many plaques you need, a mix of Google, Instagram and Universal destinations, multiple locations, placement setup, TapLocal management and owner portal access.'),
  ('custom-taplocal-plaque','Custom Branded SmartPlaque','custom',80,true,'I''m interested',
   'Your logo, your colours, on a premium acrylic plaque.',
   'A SmartPlaque printed with your own artwork — logo, colours and wording — on the finish and base of your choice. Same preprogrammed NFC chip, unique QR and TapLocal SmartLink as every other plaque.'),
  ('managed-taplocal-setup','Managed TapLocal Setup','services',90,false,'I''m interested',
   'We set up your plaques, destinations and portal for you.',
   'TapLocal handles the setup: connecting your business, pointing every plaque at the right destination, placing them well and walking you through the owner portal.')
 ) as t(slug,name,category,sort_order,featured,cta,short_desc,full_desc)
), final as (
 select r.*, p.v,
  case r.slug
   when 'google-review-smartplaque' then p.v->>'google'
   when 'instagram-smartplaque' then p.v->>'insta'
   when 'universal-smartplaque' then p.v->>'uni'
   when 'smartplaque-pack-2' then p.v->>'p2'
   when 'smartplaque-pack-4' then p.v->>'p4'
   when 'multi-location-pack' then p.v->>'multi'
   when 'custom-business-pack' then p.v->>'pcust'
   when 'custom-taplocal-plaque' then p.v->>'brand'
   else p.v->>'portal' end as image_url,
  case r.slug
   when 'google-review-smartplaque' then jsonb_build_object(
    'physical',true,'tagline','NFC + QR · Preprogrammed · Changeable destination',
    'features',jsonb_build_array('NFC preprogrammed','Unique QR code','Permanent TapLocal SmartLink','Destination can be changed later','Tap and scan activity tracked'),
    'finishes',p.fin,'bases',p.bases,'quantities',jsonb_build_array('1','2','4','Not sure'),
    'gallery',jsonb_build_array(
      jsonb_build_object('url',p.v->>'google','caption','Cloud White face, clear acrylic base'),
      jsonb_build_object('url',p.v->>'p2','caption','Pairs well on counter and entrance'),
      jsonb_build_object('url',p.v->>'anat','caption','Front, chip, QR back and cover sticker'),
      jsonb_build_object('url',p.v->>'fb','caption','Black Marble finish')))
   when 'instagram-smartplaque' then jsonb_build_object(
    'physical',true,'tagline','NFC + QR · Own plaque identity · Engagement tracked',
    'features',jsonb_build_array('NFC + QR built in','Unique plaque identity','Engagement tracked','Destination can change','Managed by TapLocal'),
    'finishes',p.fin_ig,'bases',p.bases,'quantities',jsonb_build_array('1','2','4','Not sure'),
    'gallery',jsonb_build_array(
      jsonb_build_object('url',p.v->>'insta','caption','Soft Pink face, clear acrylic base'),
      jsonb_build_object('url',p.v->>'p2','caption','Beside a Google review plaque'),
      jsonb_build_object('url',p.v->>'fw','caption','Cloud White alternative')))
   when 'universal-smartplaque' then jsonb_build_object(
    'physical',true,'tagline','Reviews · Social · Menu · Booking · Website · Custom',
    'features',jsonb_build_array('NFC + QR built in','Any destination you choose','Change destination any time','Interaction tracking','Premium black marble option'),
    'finishes',jsonb_build_array(
      jsonb_build_object('name','Black Marble','image',p.v->>'fb'),
      jsonb_build_object('name','Light Smoke','image',p.v->>'fs'),
      jsonb_build_object('name','Cloud White','image',p.v->>'fw')),
    'bases',p.bases,'quantities',jsonb_build_array('1','2','4','Not sure'),
    'gallery',jsonb_build_array(
      jsonb_build_object('url',p.v->>'uni','caption','Black Marble face, weighted metal base'),
      jsonb_build_object('url',p.v->>'portal','caption','Sample TapLocal activity view'),
      jsonb_build_object('url',p.v->>'pcust','caption','Mixed finishes')))
   when 'smartplaque-pack-2' then jsonb_build_object(
    'physical',true,'quantity',2,'tagline','Front counter + entrance · Counter + table · Reception + checkout',
    'features',jsonb_build_array('2 SmartPlaques','Own SmartLink per plaque','Placement comparison','Same or mixed designs','Setup included'),
    'designs',jsonb_build_array('Same design','Mixed designs','Not sure'),
    'finishes',p.fin,'bases',p.bases,
    'gallery',jsonb_build_array(
      jsonb_build_object('url',p.v->>'p2','caption','Exactly two plaques'),
      jsonb_build_object('url',p.v->>'google','caption','Google review plaque'),
      jsonb_build_object('url',p.v->>'insta','caption','Instagram plaque')))
   when 'smartplaque-pack-4' then jsonb_build_object(
    'physical',true,'quantity',4,'tagline','Counter · Table · Entrance · Checkout',
    'features',jsonb_build_array('4 SmartPlaques','Own SmartLink per plaque','Placement comparison','Mix of designs and finishes','Setup included'),
    'designs',jsonb_build_array('Same design','Mixed designs','Not sure'),
    'finishes',p.fin,'bases',p.bases,
    'gallery',jsonb_build_array(
      jsonb_build_object('url',p.v->>'p4','caption','Exactly four plaques'),
      jsonb_build_object('url',p.v->>'portal','caption','Sample placement comparison')))
   when 'multi-location-pack' then jsonb_build_object(
    'physical',true,'tagline','2+ locations · Per-location plaques · One account',
    'features',jsonb_build_array('Plaques per location','Separate activity per location','One TapLocal account','Rollout help','Ongoing management'),
    'locations',jsonb_build_array('2','3','4','5+'),
    'finishes',p.fin,'bases',p.bases,
    'gallery',jsonb_build_array(
      jsonb_build_object('url',p.v->>'multi','caption','Grouped by location'),
      jsonb_build_object('url',p.v->>'portal','caption','Sample activity view')))
   when 'custom-business-pack' then jsonb_build_object(
    'physical',true,'builder',true,'tagline','Custom artwork · Any quantity · Mixed destinations',
    'features',jsonb_build_array('Custom plaque artwork','Any number of plaques','Mixed destinations','Multiple locations','Placement setup','TapLocal management','Owner portal access'),
    'finishes',p.fin_all,'bases',p.bases,
    'gallery',jsonb_build_array(
      jsonb_build_object('url',p.v->>'pcust','caption','A mixed arrangement'),
      jsonb_build_object('url',p.v->>'brand','caption','Custom branded face')))
   when 'custom-taplocal-plaque' then jsonb_build_object(
    'physical',true,'tagline','Your artwork · Premium finishes · Same TapLocal technology',
    'features',jsonb_build_array('Custom printed artwork','Choice of finish and base','NFC preprogrammed','Unique QR and SmartLink','Design help included'),
    'finishes',p.fin_all,'bases',p.bases,'quantities',jsonb_build_array('1','2','4','5+','Not sure'),
    'gallery',jsonb_build_array(
      jsonb_build_object('url',p.v->>'brand','caption','Brushed light smoke with weighted base'),
      jsonb_build_object('url',p.v->>'pcust','caption','Finish family')))
   else jsonb_build_object(
    'physical',false,'tagline','Setup · Destinations · Portal walkthrough',
    'features',jsonb_build_array('Business connected','Destinations configured','Placement advice','Portal walkthrough'),
    'gallery',jsonb_build_array(jsonb_build_object('url',p.v->>'portal','caption','Sample owner portal')))
  end as metadata
 from rows r cross join parts p
)
insert into public.offerings (name, slug, category, short_description, full_description, image_url, cta_label, sort_order, active, featured, metadata)
select name, slug, category, short_desc, full_desc, image_url, cta, sort_order, true, featured, metadata from final
on conflict (slug) do update set
 name=excluded.name, category=excluded.category, short_description=excluded.short_description,
 full_description=excluded.full_description, image_url=excluded.image_url, cta_label=excluded.cta_label,
 sort_order=excluded.sort_order, featured=excluded.featured, metadata=excluded.metadata;