import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export interface CarteiraSummaryRow {
  status: string;
  carteira: string;
  valorAtualizado: number;
  ganhoFinanceiro: number;
  rentabilidade: number;
}

interface Props {
  rows: CarteiraSummaryRow[];
  hideCarteiras?: string[];
}

function fmtBrl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function CarteirasSummaryTable({ rows, hideCarteiras }: Props) {
  const visible = hideCarteiras
    ? rows.filter(r => !hideCarteiras.includes(r.carteira))
    : rows;

  if (visible.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[70px]">Status</TableHead>
            <TableHead className="min-w-[180px]">Carteira</TableHead>
            <TableHead className="min-w-[130px] text-right">Valor Atualizado</TableHead>
            <TableHead className="min-w-[130px] text-right">Ganho Financeiro</TableHead>
            <TableHead className="min-w-[110px] text-right">Rentabilidade</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((row, i) => (
            <TableRow key={i}>
              <TableCell>
                <Badge
                  variant={row.status === "Ativa" ? "default" : "secondary"}
                  className={
                    row.status === "Ativa"
                      ? "bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] px-2 py-0.5"
                      : row.status === "Encerrada"
                        ? "bg-destructive/15 text-destructive text-[10px] px-2 py-0.5"
                        : "bg-muted text-muted-foreground text-[10px] px-2 py-0.5"
                  }
                >
                  {row.status}
                </Badge>
              </TableCell>
              <TableCell className="font-medium text-foreground">{row.carteira}</TableCell>
              <TableCell className="text-right text-foreground">{fmtBrl(row.valorAtualizado)}</TableCell>
              <TableCell className="text-right text-foreground">{fmtBrl(row.ganhoFinanceiro)}</TableCell>
              <TableCell className="text-right text-foreground">{row.rentabilidade.toFixed(2)}%</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
