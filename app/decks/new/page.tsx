"use client";

/**
 * Route existed in the original repository; redirect to the prompt-first
 * landing so it doesn't 404.
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
