"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { destinoPosLogin, getSessaoSnapshot } from "@/lib/session";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const sessao = getSessaoSnapshot();
    router.replace(sessao ? destinoPosLogin(sessao.tipoPapel) : "/login");
  }, [router]);

  return null;
}
