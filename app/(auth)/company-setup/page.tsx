import Link from "next/link";

export default function CompanySetupPage() {
  return (
    <main className="app-canvas flex min-h-dvh items-center justify-center p-6">
      <div className="glass-card max-w-lg rounded-3xl p-8 text-center">
        <h1 className="text-2xl font-semibold text-neutral-900">Configuration des sociétés en attente</h1>
        <p className="mt-4 text-sm leading-relaxed text-neutral-600">La base de données doit être mise à jour avant d’ouvrir Overseas Services et Overseas Lifting. Si la migration a déjà été appliquée, vérifiez la connexion à la base de données puis rechargez cette page.</p>
        <Link className="mt-6 inline-flex min-h-11 items-center rounded-full bg-ink-900 px-5 text-sm font-semibold text-white" href="/companies">Retour aux sociétés</Link>
      </div>
    </main>
  );
}
