"use client";

/**
 * Legacy route. Creation is prompt-first on the landing page now; keep
 * this path working for old links by redirecting home.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function NewDeckRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return null;
}
