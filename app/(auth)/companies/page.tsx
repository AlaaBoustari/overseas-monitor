import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/login/actions";
import { getAccessContext } from "@/lib/auth/can-edit";
import { companies, companyIds } from "@/lib/company-details";
import servicesCard from "@/public/SERVICES.png";
import liftingCard from "@/public/LIFTING.png";
import styles from "./company-picker.module.css";

const cardImages = { services: servicesCard, lifting: liftingCard };

export default async function CompaniesPage() {
  const access = await getAccessContext();
  if (!access.userId) redirect("/login");

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Choisissez la société pour continuer</h1>
        <div className={styles.cards}>
          {companyIds.map((id) => (
            <Link aria-label={`Continuer avec ${companies[id].name}`} className={styles.card} href={`/${id}/dashboard`} key={id}>
              <Image alt={companies[id].name} className={styles.image} preload sizes="(max-width: 767px) calc(100vw - 48px), (max-width: 1536px) 46vw, 696px" src={cardImages[id]} />
            </Link>
          ))}
        </div>
        <form action={signOut} className={styles.logout}>
          <button className="inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600" type="submit"><LogOut aria-hidden size={16} />Se déconnecter</button>
        </form>
      </div>
    </main>
  );
}
