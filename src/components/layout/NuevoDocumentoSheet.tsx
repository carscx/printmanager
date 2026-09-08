import { ActionSheet } from "../ui/ActionSheet";
import { useNavigate } from "react-router-dom";

const OPTIONS = [
  { value: "impresion", label: "Impresión" },
  { value: "producto", label: "Producto cerrado" }
] as const;

export function NuevoDocumentoSheet({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();

  return (
    <ActionSheet
      open={open}
      onClose={onClose}
      title="Nuevo"
      options={[...OPTIONS]}
      value=""
      onChange={(v) => {
        if (v === "impresion") {
          navigate("/nuevo-pedido", { state: { modo: "nuevo" } });
        } else {
          navigate("/nuevo-producto", { state: { modo: "nuevo" } });
        }
      }}
    />
  );
}
