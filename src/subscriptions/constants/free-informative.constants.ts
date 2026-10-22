export const FREE_INFORMATIVE_FEATURES: Record<string, string[]> = {
  es: [
    'Control de stock en tiempo real',
    'Registro de ventas',
    'Carga de stock y costos',
    'Creación manual de productos',
    'Alertas de stock mínimo',
    'Dashboard con métricas básicas',
  ],
  en: [
    'Real-time stock control',
    'Sales tracking',
    'Stock and cost entry',
    'Manual product creation',
    'Minimum stock alerts',
    'Dashboard with basic metrics',
  ],
  pt: [
    'Controle de estoque em tempo real',
    'Registro de vendas',
    'Cadastro de estoque e custos',
    'Criação manual de produtos',
    'Alertas de estoque mínimo',
    'Dashboard com métricas básicas',
  ],
  de: [
    'Echtzeit-Lagerbestandsprüfung',
    'Umsatzverfolgung',
    'Bestands- und Kostenerfassung',
    'Manuelle Anlage von Produkten',
    'Mindestbestandswarnungen',
    'Dashboard mit Basis-Metriken',
  ],
  fr: [
    'Contrôle des stocks en temps réel',
    'Suivi des ventes',
    'Saisie des stocks et des coûts',
    'Création manuelle de produits',
    'Alertes de stock minimum',
    'Tableau de bord avec métriques de base',
  ],
  it: [
    'Controllo delle scorte in tempo reale',
    'Registrazione delle vendite',
    'Caricamento di scorte e costi',
    'Creazione manuale dei prodotti',
    'Avvisi di giacenza minima',
    'Dashboard con metriche di base',
  ],
}

export interface PlanMetadata {
  productId: string
  name: Record<string, string>
  description: Record<string, string>
  priceDisplay: string // 👈 El precio aquí listo
  periodSuffix: Record<string, string>
  displayOrderAndroid: number
  displayOrderWeb: number
}

export const SUBSCRIPTION_PLANS_METADATA: Record<string, PlanMetadata> = {
  FREE: {
    productId: 'kium_free_tier',
    name: {
      es: 'GRATIS',
      en: 'FREE',
      pt: 'GRATIS',
      de: 'KOSTENLOS',
      fr: 'GRATUIT',
      it: 'GRATUITO',
    },
    description: {
      es: 'Para empezar a controlar tu negocio.',
      en: 'To start managing your business.',
      pt: 'Para começar a controlar o seu negócio.',
      de: 'Um Ihr Unternehmen zu steuern.',
      fr: 'Pour commencer à gérer votre entreprise.',
      it: 'Per iniziare a gestire la tua attività.',
    },
    priceDisplay: '$0',
    periodSuffix: {
      es: '/mes',
      en: '/mo',
      pt: '/mês',
      de: '/Monat',
      fr: '/mois',
      it: '/mese',
    },
    displayOrderAndroid: 3,
    displayOrderWeb: 1,
  },
  PRO: {
    productId: 'com.valtarius.kium.pro.monthly',
    name: {
      es: 'PRO',
      en: 'PRO',
      pt: 'PRO',
      de: 'PRO',
      fr: 'PRO',
      it: 'PRO',
    },
    description: {
      es: 'Para comercios que necesitan agilizar la gestión de su catálogo.',
      en: 'For merchants needing streamlined catalog management.',
      pt: 'Para comércios que precisam agilizar a gestão do catálogo.',
      de: 'Für Händler zur vereinfachten Katalogverwaltung.',
      fr: 'Pour les commerçants nécessitant une gestion simplifiée.',
      it: 'Per i commercianti che necessitano di una gestione rapida.',
    },
    priceDisplay: 'ARS 12.499', // 👈 Tu precio informativo listo para pintar
    periodSuffix: {
      es: '/mes',
      en: '/mo',
      pt: '/mês',
      de: '/Monat',
      fr: '/mois',
      it: '/mese',
    },
    displayOrderAndroid: 2,
    displayOrderWeb: 2,
  },
  PRO_PLUS: {
    productId: 'com.valtarius.kium.proplus.monthly',
    name: {
      es: 'PRO+',
      en: 'PRO+',
      pt: 'PRO+',
      de: 'PRO+',
      fr: 'PRO+',
      it: 'PRO+',
    },
    description: {
      es: 'El centro de control inteligente para comercios que quieren analizar su negocio y tomar mejores decisiones.',
      en: 'The intelligent control center for merchants wanting deep business analytics.',
      pt: 'O centro de controle inteligente para analisar o seu negócio.',
      de: 'Das intelligente Kontrollzentrum für Geschäftsanalysen.',
      fr: 'Le centre de contrôle intelligent pour analyser votre entreprise.',
      it: 'Il centro di controllo intelligente per analizzare la tua attività.',
    },
    priceDisplay: 'ARS 18.999', // 👈 Tu precio informativo listo para pintar
    periodSuffix: {
      es: '/mes',
      en: '/mo',
      pt: '/mês',
      de: '/Monat',
      fr: '/mois',
      it: '/mese',
    },
    displayOrderAndroid: 1,
    displayOrderWeb: 3,
  },
}
