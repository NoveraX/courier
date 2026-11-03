import { routes } from "@noverax/courier/routes";

/* The routes as the Pages Router's server renders them. */
export default function LegacyRoutes({ server }: { server: string }) {
  return <p id="legacy-routes">{server}</p>;
}

export function getServerSideProps() {
  return { props: { server: Object.keys(routes.catalog.endpoints).join(",") } };
}
