CREATE OR REPLACE FUNCTION private.remember_member_roll_number_before_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF coalesce(OLD.approved, false)
     AND coalesce(OLD.status, '') = 'approved'
     AND coalesce(OLD.role_number, '') ~ '^YYC-[0-9]{4}-M-[0-9]+$' THEN
    INSERT INTO private.member_roll_number_history (role_number, member_id)
    VALUES (OLD.role_number, OLD.id)
    ON CONFLICT (role_number, member_id) DO NOTHING;
  END IF;
  RETURN OLD;
END;
$function$
;

REVOKE ALL ON FUNCTION private.remember_member_roll_number_before_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_remember_member_roll_number_before_delete ON public.members;

CREATE TRIGGER trg_remember_member_roll_number_before_delete
BEFORE DELETE ON public.members
FOR EACH ROW
EXECUTE FUNCTION private.remember_member_roll_number_before_delete();
