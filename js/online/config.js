'use strict';
// Online settings (docs/RELEASE_CHECKLIST.md). Leave url empty to run fully offline: every feature still works locally,
// online rankings/league fall back to AI rivals and the cloud save is skipped.
//   url / anonKey   Supabase project URL and anon (public) key: Project Settings > API
//   schema          Postgres schema of this game inside the shared project (server/supabase/migrations)
//   googleWebClientId  OAuth 'Web application' client id (Google Cloud) also set in Supabase > Auth > Google; the app
//                   asks Android Credential Manager for an ID token for it (Google account link / sign-in)
//   release         true in store builds: hides the browser-only test payment/ad dialogs
const ONLINE_CONFIG = {
    url: 'https://qcjskzblzvmepdazoobt.supabase.co',
    schema: 'bonghwa',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjanNremJsenZtZXBkYXpvb2J0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgyNjAxOTgsImV4cCI6MjA3MzgzNjE5OH0.vIGymiemOp120InDukrUcJrb5iga3ceQx_ylKccmM9A',
    googleWebClientId: '354656279161-0jjbifv1o8qni3smhbq22j5i12nnud9t.apps.googleusercontent.com',
    release: true,
};
