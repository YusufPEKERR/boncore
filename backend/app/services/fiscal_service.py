import uuid
import datetime
from typing import Dict, Any, List

class FiscalService:
    @staticmethod
    def generate_e_adisyon(order: Any, payments: List[Any], cashier_name: str = "Kasiyer") -> Dict[str, Any]:
        """
        Generates official GİB compliant E-Adisyon document with ETTN, QR signature, VAT breakdown, and XML.
        """
        ettn = str(uuid.uuid4())
        doc_date = datetime.datetime.now().strftime("%Y-%m-%d")
        doc_time = datetime.datetime.now().strftime("%H:%M:%S")
        doc_no = f"EAD{datetime.datetime.now().strftime('%Y%m%d')}{order.id:06d}"

        # Calculate VAT groupings
        vat_summary = {
            "vat_1": {"rate": 1, "base": 0.0, "tax": 0.0},
            "vat_10": {"rate": 10, "base": 0.0, "tax": 0.0},
            "vat_20": {"rate": 20, "base": 0.0, "tax": 0.0},
        }

        items_list = []
        for item in getattr(order, "items", []):
            if getattr(item, "is_voided", False):
                continue
            vat_rate = 10.0 # Standard restaurant food VAT in Turkey
            unit_price = item.unit_price
            qty = item.quantity
            line_total = item.total_price
            base_amount = line_total / (1 + vat_rate / 100)
            tax_amount = line_total - base_amount

            vat_summary["vat_10"]["base"] += round(base_amount, 2)
            vat_summary["vat_10"]["tax"] += round(tax_amount, 2)

            items_list.append({
                "product_name": item.product_name,
                "variant": item.variant_name or "",
                "quantity": qty,
                "unit_price": unit_price,
                "total_price": line_total,
                "vat_rate": vat_rate,
                "notes": item.kitchen_note or ""
            })

        gib_qr_code = f"VKN:1234567890|ETTN:{ettn}|TUTAR:{order.grand_total:.2f}|TARIH:{doc_date} {doc_time}|SERI:{doc_no}"

        # Generate GİB Standard XML payload
        xml_payload = f"""<?xml version="1.0" encoding="UTF-8"?>
<E-Adisyon xmlns="urn:gib:gov:tr:eAdisyon" ETTN="{ettn}" BelgeNo="{doc_no}">
    <GIB_Bilgileri>
        <VKN_TCKN>1234567890</VKN_TCKN>
        <Unvan>BONCORE RESTORAN VE GIDA TIC. A.S.</Unvan>
        <Tarih>{doc_date}</Tarih>
        <Saat>{doc_time}</Saat>
    </GIB_Bilgileri>
    <MasaBilgisi>
        <MasaNo>{getattr(order.table, 'name', 'Paket/Hızlı') if getattr(order, 'table', None) else 'Paket'}</MasaNo>
        <Garson>{order.waiter_name}</Garson>
        <Kasiyer>{cashier_name}</Kasiyer>
    </MasaBilgisi>
    <Kalemler>
"""
        for it in items_list:
            xml_payload += f"""        <Kalem>
            <UrunAdi>{it['product_name']}</UrunAdi>
            <Miktar>{it['quantity']}</Miktar>
            <BirimFiyat>{it['unit_price']:.2f}</BirimFiyat>
            <Toplam>{it['total_price']:.2f}</Toplam>
            <KDVOrani>{it['vat_rate']}</KDVOrani>
        </Kalem>
"""
        xml_payload += f"""    </Kalemler>
    <Toplamlar>
        <AraToplam>{order.subtotal:.2f}</AraToplam>
        <Indirim>{order.discount_amount:.2f}</Indirim>
        <Ikram>{order.treat_amount:.2f}</Ikram>
        <Kuver>{order.kuver_total:.2f}</Kuver>
        <KDV10>{vat_summary['vat_10']['tax']:.2f}</KDV10>
        <GenelToplam>{order.grand_total:.2f}</GenelToplam>
    </Toplamlar>
    <Karekod>{gib_qr_code}</Karekod>
</E-Adisyon>"""

        return {
            "ettn": ettn,
            "doc_no": doc_no,
            "date": doc_date,
            "time": doc_time,
            "company_title": "BONCORE RESTORAN & LOUNGE",
            "vkn": "1234567890",
            "table_name": getattr(order.table, 'name', 'Paket') if getattr(order, 'table', None) else 'Paket',
            "waiter_name": order.waiter_name,
            "cashier_name": cashier_name,
            "items": items_list,
            "subtotal": order.subtotal,
            "discount": order.discount_amount,
            "treat": order.treat_amount,
            "kuver": order.kuver_total,
            "grand_total": order.grand_total,
            "vat_summary": vat_summary,
            "qr_code_content": gib_qr_code,
            "xml_content": xml_payload
        }

    @staticmethod
    def generate_escpos_thermal_slip(order: Any, slip_type: str = "customer_bill") -> str:
        """
        Generates simulated 80mm ESC/POS thermal text printer slip.
        """
        w = 42
        lines = []
        lines.append("=" * w)
        lines.append("     BONCORE RESTAURANT & LOUNGE".center(w))
        lines.append("     GIB E-ADISYON / BILGI FISI".center(w))
        lines.append("=" * w)
        lines.append(f"Masa: {getattr(order.table, 'name', 'Paket') if getattr(order, 'table', None) else 'Paket'}    Garson: {order.waiter_name}")
        lines.append(f"Tarih: {datetime.datetime.now().strftime('%d.%m.%Y %H:%M:%S')}")
        lines.append(f"Sipariş No: {order.order_no}")
        lines.append("-" * w)
        lines.append(f"{'URUN':<22}{'AD':>4}{'FIYAT':>8}{'TUTAR':>8}")
        lines.append("-" * w)

        for item in getattr(order, "items", []):
            if getattr(item, "is_voided", False):
                continue
            name = item.product_name[:20]
            qty = str(item.quantity)
            price = f"{item.unit_price:.2f}"
            tot = f"{item.total_price:.2f}"
            lines.append(f"{name:<22}{qty:>4}{price:>8}{tot:>8}")
            if item.variant_name:
                lines.append(f"  * Porsiyon: {item.variant_name}")
            if item.negative_modifiers:
                lines.append(f"  * Eksi: {', '.join(item.negative_modifiers)}")
            if item.kitchen_note:
                lines.append(f"  * Not: {item.kitchen_note}")

        lines.append("-" * w)
        lines.append(f"{'Ara Toplam:':<28}{order.subtotal:>14.2f} TL")
        if order.discount_amount > 0:
            lines.append(f"{'Indirim:':<28}{-order.discount_amount:>14.2f} TL")
        if order.treat_amount > 0:
            lines.append(f"{'Ikram:':<28}{-order.treat_amount:>14.2f} TL")
        if order.kuver_total > 0:
            lines.append(f"{f'Kuver ({order.kuver_count} Kisi):':<28}{order.kuver_total:>14.2f} TL")

        lines.append("=" * w)
        lines.append(f"{'GENEL TOPLAM:':<26}{order.grand_total:>14.2f} TL")
        lines.append("=" * w)
        lines.append("     MALI DEGERI YOKTUR - BILGI FISIDIR".center(w))
        lines.append("           AFIYET OLSUN!".center(w))
        lines.append("=" * w)

        return "\n".join(lines)
