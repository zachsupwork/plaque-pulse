do $$
declare
  b uuid := '11111111-1111-4111-8111-111111111111';
  loc uuid := '22222222-2222-4222-8222-222222222222';
  p1 uuid := '33333333-3333-4333-8333-333333333301';
  p2 uuid := '33333333-3333-4333-8333-333333333302';
  p3 uuid := '33333333-3333-4333-8333-333333333303';
  p4 uuid := '33333333-3333-4333-8333-333333333304';
  d1 uuid := '44444444-4444-4444-8444-444444444401';
  d2 uuid := '44444444-4444-4444-8444-444444444402';
  d3 uuid := '44444444-4444-4444-8444-444444444403';
  d4 uuid := '44444444-4444-4444-8444-444444444404';
  d0 uuid := '44444444-4444-4444-8444-444444444400';
  ig uuid := '55555555-5555-4555-8555-555555555501';
  gg uuid := '55555555-5555-4555-8555-555555555502';
  ex uuid := '66666666-6666-4666-8666-666666666601';
begin
insert into public.businesses (id,name,industry,timezone,primary_goal,status,is_demo)
values (b,'Joe''s Pizza','restaurant','America/Toronto','google_reviews','active',true);

insert into public.locations (id,business_id,name,address,city,province_state,country,timezone)
values (loc,b,'Main Street','118 Main St W','Hamilton','ON','Canada','America/Toronto');

insert into public.goals (business_id,goal_type,priority) values
 (b,'google_reviews',1),(b,'instagram_growth',2),(b,'menu_visits',3);

insert into public.plaques (id,plaque_code,public_slug,business_id,location_id,product_type,style,base_type,sku,plaque_name,placement_type,status,activated_at) values
 (p1,'TL-001247','X8K2P4',b,loc,'google_review','Smoky Marble','Clear Acrylic','TL-GR-SM','Front Counter','front_counter','active',now() - interval '96 days'),
 (p2,'TL-001248','M3Q7T9',b,loc,'instagram','Smoky Marble','Clear Acrylic','TL-IG-SM','Table 1','table','active',now() - interval '82 days'),
 (p3,'TL-001249','B6W1Z5',b,loc,'instagram','Smoky Marble','Clear Acrylic','TL-IG-SM','Table 2','table','active',now() - interval '82 days'),
 (p4,'TL-001250','H4L9R2',b,loc,'generic','Smoky Marble','Clear Acrylic','TL-GEN-SM','Entrance','entrance','active',now() - interval '40 days');

insert into public.destinations (id,business_id,plaque_id,destination_type,url,active,effective_from,effective_to,metadata) values
 (d1,b,p1,'google_review','https://g.page/r/joespizzahamilton/review',true,now() - interval '96 days',null,'{}'),
 (d2,b,p2,'instagram','https://instagram.com/joespizza',true,now() - interval '82 days',null,'{"username":"joespizza"}'),
 (d0,b,p3,'google_review','https://g.page/r/joespizzahamilton/review',false,now() - interval '82 days',now() - interval '21 days','{}'),
 (d3,b,p3,'instagram','https://instagram.com/joespizza',true,now() - interval '21 days',null,'{"username":"joespizza"}'),
 (d4,b,p4,'menu','https://joespizza.ca/menu',true,now() - interval '40 days',null,'{}');

insert into public.plaque_placement_history (plaque_id,location_id,placement_type,placement_name,effective_from,effective_to) values
 (p1,loc,'table','Table 3',now() - interval '96 days',now() - interval '19 days'),
 (p1,loc,'front_counter','Front Counter',now() - interval '19 days',null),
 (p2,loc,'table','Table 1',now() - interval '82 days',null),
 (p3,loc,'table','Table 2',now() - interval '82 days',null),
 (p4,loc,'entrance','Entrance',now() - interval '40 days',null);

-- interactions
insert into public.events (business_id,location_id,plaque_id,event_type,source_type,intent_type,destination_type,destination_id,device_family,browser_family,coarse_country,coarse_region,anonymous_visitor_key,occurred_at)
select b, loc, p.id, 'interaction',
  (case when random() < p.nfc_share then 'nfc' else 'qr' end)::public.source_type,
  p.intent::public.intent_type, p.dest::public.destination_type, p.dest_id,
  (case when random() < 0.72 then 'iPhone' else 'Android' end),
  (case when random() < 0.72 then 'Safari' else 'Chrome' end),
  'CA','ON', 'v_' || floor(random()*900+100)::text,
  now() - (power(random(), p.bias) * interval '30 days')
from (values
  (p1, 251, 0.78, 'review', 'google_review', d1, 1.45),
  (p2, 103, 0.55, 'social', 'instagram', d2, 1.20),
  (p3, 81,  0.55, 'social', 'instagram', d3, 0.72),
  (p4, 48,  0.40, 'menu',   'menu',      d4, 1.15)
) as p(id, n, nfc_share, intent, dest, dest_id, bias),
lateral generate_series(1, p.n);

-- redirect successes mirror interactions
insert into public.events (business_id,location_id,plaque_id,event_type,source_type,intent_type,destination_type,destination_id,occurred_at)
select business_id,location_id,plaque_id,'redirect_success',source_type,intent_type,destination_type,destination_id,occurred_at + interval '300 milliseconds'
from public.events where business_id = b and event_type = 'interaction' and random() < 0.97;

insert into public.integrations (id,business_id,integration_type,external_account_id,status,connected_at,last_sync_at) values
 (gg,b,'google_business','accounts/joespizza','connected',now() - interval '60 days',now() - interval '3 hours'),
 (ig,b,'instagram','joespizza','connected',now() - interval '45 days',now() - interval '5 hours');

insert into public.metric_snapshots (business_id,integration_id,metric_type,metric_value,captured_at) values
 (b,gg,'google_review_count',184,now() - interval '30 days'),
 (b,gg,'google_review_count',198,now()),
 (b,gg,'google_rating',4.5,now() - interval '30 days'),
 (b,gg,'google_rating',4.6,now()),
 (b,ig,'instagram_followers',2190,now() - interval '30 days'),
 (b,ig,'instagram_followers',2218,now()),
 (b,ig,'instagram_profile_views',124,now());

insert into public.outcomes (business_id,plaque_id,outcome_type,attribution_type,value,occurred_at)
select b, p4, 'lead', 'direct', 240, now() - (random() * interval '30 days') from generate_series(1,14);
insert into public.outcomes (business_id,plaque_id,outcome_type,attribution_type,value,occurred_at)
select b, p1, 'coupon_redemption', 'direct', 18, now() - (random() * interval '30 days') from generate_series(1,7);
insert into public.outcomes (business_id,plaque_id,outcome_type,attribution_type,value,occurred_at)
select b, p2, 'booking', 'direct', 65, now() - (random() * interval '30 days') from generate_series(1,9);
insert into public.outcomes (business_id,outcome_type,attribution_type,value,occurred_at) values
 (b,'new_review','correlated',14,now()),
 (b,'new_follower','correlated',28,now());

insert into public.experiments (id,business_id,name,hypothesis,experiment_type,primary_goal,status,started_at) values
 (ex,b,'Exit review plaque','A second review plaque near the exit will lift review interactions without cannibalising the front counter.','placement','google_reviews','running',now() - interval '6 days');
insert into public.experiment_variants (experiment_id,plaque_id,label,configuration) values
 (ex,p1,'Control — Front Counter','{"placement":"front_counter"}'),
 (ex,p4,'Variant — Entrance','{"placement":"entrance"}');

insert into public.recommendations (business_id,recommendation_type,title,explanation,evidence,proposed_action,confidence,status) values
 (b,'placement','Test a second review plaque near the exit',
  'Your Front Counter generated 2.4x more Google Review interactions than your table plaques.',
  '{"front_counter_interactions":251,"table_interactions":184,"ratio":2.4}',
  '{"action":"start_experiment","experiment_type":"placement","duration_days":14}', 0.82, 'new'),
 (b,'destination','Table 2 may do better on menu than Instagram',
  'Table 2 interactions fell 5% while Table 1 rose 12% on the same destination.',
  '{"table_2_change":-5,"table_1_change":12}',
  '{"action":"change_destination","plaque":"Table 2","from":"instagram","to":"menu"}', 0.54, 'new');

insert into public.action_history (business_id,plaque_id,action_type,previous_value,new_value,initiated_by,created_at) values
 (b,p1,'change_placement','{"placement":"table","name":"Table 3"}','{"placement":"front_counter","name":"Front Counter"}','owner',now() - interval '19 days'),
 (b,p3,'change_destination','{"destination_type":"google_review"}','{"destination_type":"instagram"}','owner',now() - interval '21 days'),
 (b,p4,'activate_plaque',null,'{"plaque_name":"Entrance","destination_type":"menu"}','owner',now() - interval '40 days');

insert into public.subscriptions (business_id,plan,status,renews_at) values (b,'growth','active',now() + interval '22 days');

-- inventory plaques for admin surface
insert into public.plaques (plaque_code,public_slug,product_type,style,base_type,sku,status)
select 'TL-00' || (1300 + g)::text, upper(substr(md5(random()::text),1,6)), 'google_review','Smoky Marble','Clear Acrylic','TL-GR-SM','inventory'
from generate_series(1,24) g;
end $$;