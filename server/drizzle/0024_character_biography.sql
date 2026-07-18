-- Biography + perk description for Characters page.
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "biography" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "perk_description" text DEFAULT '' NOT NULL;--> statement-breakpoint

UPDATE "characters" SET
	"biography" = CASE "id"
		WHEN 'garla' THEN 'Garla was rebuilt after a boarding action left little more than a combat cortex and a will to finish the fight. Her visor maps threat vectors in hard light; every weapon in her hands hits a shade harder than doctrine allows. Crews call her the edge of the blade — first through the hatch, last to leave a kill zone.'
		WHEN 'olrick' THEN 'Olrick carries the weight of a failed orbital drop and the armor that saved him. Quiet on the channel, louder in the breach — he holds lanes so lighter operators can move. His face module is still in fabrication; until then he borrows the company visor pattern.'
		WHEN 'morgana' THEN 'Morgana cuts through sensor fog the way others cut through doors. She was trained for silent corridors and compromised decks where a single footprint is a death sentence. Her combat face is still classified; the roster shows a placeholder until clearance clears.'
		WHEN 'p_anne' THEN 'P. Anne measures fights in millimeters and milliseconds. Ex-range instructor turned field operator, she prefers one perfect shot to a magazine of noise. Her personal face mesh is queued; until it ships she runs the shared digital visor.'
		ELSE "biography"
	END,
	"perk_label" = CASE "id"
		WHEN 'garla' THEN 'Weapon Specialization'
		WHEN 'olrick' THEN 'Fortress Protocol'
		WHEN 'morgana' THEN 'Umbral Step'
		WHEN 'p_anne' THEN 'Deadeye Calculus'
		ELSE "perk_label"
	END,
	"perk_description" = CASE "id"
		WHEN 'garla' THEN '+1 damage with all weapons.'
		WHEN 'olrick' THEN 'Perk module incoming — hold the line until then.'
		WHEN 'morgana' THEN 'Perk module incoming — stay off the scopes until then.'
		WHEN 'p_anne' THEN 'Perk module incoming — keep the reticle honest until then.'
		ELSE "perk_description"
	END,
	"updated_at" = NOW()
WHERE "id" IN ('garla', 'olrick', 'morgana', 'p_anne');
