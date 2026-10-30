import io
import uuid
import datetime
from typing import Dict, Any, List
from PIL import Image, ImageDraw, ImageFont

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
        <AraToplam>{(order.subtotal or 0.0):.2f}</AraToplam>
        <Indirim>{(order.discount_amount or 0.0):.2f}</Indirim>
        <Ikram>{(order.treat_amount or 0.0):.2f}</Ikram>
        <Kuver>{(order.kuver_total or 0.0):.2f}</Kuver>
        <KDV10>{vat_summary['vat_10']['tax']:.2f}</KDV10>
        <GenelToplam>{(order.grand_total or 0.0):.2f}</GenelToplam>
    </Toplamlar>
    <Karekod>{gib_qr_code}</Karekod>
</E-Adisyon>"""

        method_map = {
            "cash": "NAKİT",
            "credit_card": "KREDİ KARTI",
            "open_account": "AÇIK HESAP",
            "sodexo": "SODEXO",
            "multinet": "MULTİNET",
            "ticket": "TICKET",
            "meal_card": "YEMEK KARTI",
            "online": "ONLINE ÖDEME"
        }
        payment_list = []
        for p in (payments or []):
            m_key = getattr(p, "payment_method", None) or getattr(p, "method", None) or (p.get("method") if isinstance(p, dict) else "cash")
            m_amt = getattr(p, "amount", None) or (p.get("amount") if isinstance(p, dict) else 0.0)
            payment_list.append({
                "method": m_key,
                "label": method_map.get(str(m_key), str(m_key).upper()),
                "amount": float(m_amt or 0.0)
            })

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
            "subtotal": order.subtotal or 0.0,
            "discount": order.discount_amount or 0.0,
            "treat": order.treat_amount or 0.0,
            "kuver": order.kuver_total or 0.0,
            "service_charge": getattr(order, "service_charge", 0.0) or 0.0,
            "grand_total": order.grand_total or 0.0,
            "payments": payment_list,
            "vat_summary": vat_summary,
            "qr_code_content": gib_qr_code,
            "xml_content": xml_payload
        }

    @staticmethod
    def generate_escpos_thermal_slip(order: Any, slip_type: str = "customer_bill") -> str:
        """
        Generates simulated 80mm ESC/POS thermal text printer slip.
        """
        method_map = {
            "cash": "NAKIT",
            "credit_card": "KREDI KARTI",
            "open_account": "ACIK HESAP",
            "sodexo": "SODEXO",
            "multinet": "MULTINET",
            "ticket": "TICKET",
            "meal_card": "YEMEK KARTI",
            "online": "ONLINE ODEME"
        }
        w = 42
        lines = []
        lines.append("━" * w)
        lines.append("     BONCORE RESTAURANT & LOUNGE".center(w))
        lines.append("     GIB E-ADISYON / BILGI FISI".center(w))
        lines.append("━" * w)
        lines.append(f"Masa: {getattr(order.table, 'name', 'Paket') if getattr(order, 'table', None) else 'Paket'}    Garson: {order.waiter_name}")
        lines.append(f"Tarih: {datetime.datetime.now().strftime('%d.%m.%Y %H:%M:%S')}")
        lines.append(f"Sipariş No: {order.order_no}")
        lines.append("─" * w)
        lines.append(f"{'URUN':<22}{'AD':>4}{'FIYAT':>8}{'TUTAR':>8}")
        lines.append("─" * w)

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

        lines.append("─" * w)
        lines.append(f"{'Ara Toplam:':<28}{(order.subtotal or 0.0):>11.2f} TL")
        if (order.discount_amount or 0.0) > 0:
            lines.append(f"{'Indirim:':<28}{-(order.discount_amount or 0.0):>11.2f} TL")
        if (order.treat_amount or 0.0) > 0:
            lines.append(f"{'Ikram:':<28}{-(order.treat_amount or 0.0):>11.2f} TL")
        if (order.kuver_total or 0.0) > 0:
            lines.append(f"{f'Kuver ({order.kuver_count or 1} Kisi):':<28}{(order.kuver_total or 0.0):>11.2f} TL")
        if (getattr(order, 'service_charge', 0.0) or 0.0) > 0:
            lines.append(f"{'Servis Bedeli:':<28}{(order.service_charge or 0.0):>11.2f} TL")

        lines.append("━" * w)
        lines.append(f"{'GENEL TOPLAM:':<26}{(order.grand_total or 0.0):>13.2f} TL")
        order_payments = getattr(order, "payments", []) or []
        if order_payments:
            lines.append("─" * w)
            for p in order_payments:
                m_key = getattr(p, "payment_method", "cash")
                m_label = f"ODEME ({method_map.get(m_key, str(m_key).upper())}):"
                lines.append(f"{m_label:<26}{(p.amount or 0.0):>13.2f} TL")
        lines.append("━" * w)
        lines.append("     MALI DEGERI YOKTUR - BILGI FISIDIR".center(w))
        lines.append("           AFIYET OLSUN!".center(w))
        lines.append("━" * w)

        return "\n".join(lines)

    @staticmethod
    def generate_e_adisyon_pdf(doc: Dict[str, Any]) -> bytes:
        """
        Generates a high-resolution PDF document for the official GİB E-Adisyon receipt.
        """
        def load_font(bold: bool = False, mono: bool = False, size: int = 16):
            candidates = []
            if mono:
                candidates = [
                    "C:/Windows/Fonts/courbd.ttf" if bold else "C:/Windows/Fonts/cour.ttf",
                    "C:/Windows/Fonts/consolab.ttf" if bold else "C:/Windows/Fonts/consola.ttf",
                ]
            else:
                candidates = [
                    "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
                    "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
                ]
            for path in candidates:
                try:
                    return ImageFont.truetype(path, size)
                except Exception:
                    continue
            return ImageFont.load_default()

        items = doc.get("items") or []
        payments = doc.get("payments") or []

        width = 900
        base_height = 680 + max(1, len(items)) * 44 + len(payments) * 34
        img = Image.new("RGB", (width, base_height), "#ffffff")
        draw = ImageDraw.Draw(img)

        f_title = load_font(bold=True, size=24)
        f_badge = load_font(bold=True, size=14)
        f_sub = load_font(bold=False, size=15)
        f_info_lbl = load_font(bold=False, size=16)
        f_info_val = load_font(bold=True, size=16)
        f_th = load_font(bold=True, size=14)
        f_td = load_font(bold=True, size=16)
        f_td_mono = load_font(bold=False, mono=True, size=16)
        f_td_mono_b = load_font(bold=True, mono=True, size=16)
        f_total_big = load_font(bold=True, size=24)
        f_qr_text = load_font(bold=False, mono=True, size=13)
        f_footer_b = load_font(bold=True, size=14)

        pad_x = 55
        y = 50

        # Top Banner
        draw.text((pad_x, y), str(doc.get("company_title") or "BONCORE RESTORAN & LOUNGE"), fill="#0f172a", font=f_title)

        # E-ADİSYON Badge on top right
        badge_w, badge_h = 120, 32
        badge_x = width - pad_x - badge_w
        draw.rounded_rectangle([badge_x, y - 2, badge_x + badge_w, y - 2 + badge_h], radius=6, fill="#0f172a")
        draw.text((badge_x + 18, y + 5), "E-ADİSYON", fill="#ffffff", font=f_badge)

        y += 34
        draw.text((pad_x, y), f"VKN: {doc.get('vkn', '1234567890')} • Kadıköy / İSTANBUL", fill="#475569", font=f_sub)
        dt_str = f"{doc.get('date', '')} {doc.get('time', '')}".strip()
        dt_bbox = draw.textbbox((0, 0), dt_str, font=f_sub)
        draw.text((width - pad_x - (dt_bbox[2] - dt_bbox[0]), y), dt_str, fill="#475569", font=f_sub)

        y += 24
        draw.text((pad_x, y), f"GİB E-Adisyon Belge No: {doc.get('doc_no', '')}", fill="#475569", font=f_sub)

        y += 32
        draw.line([(pad_x, y), (width - pad_x, y)], fill="#0f172a", width=3)

        # Table & Waiter Info Box
        y += 22
        box_h = 88
        draw.rounded_rectangle([pad_x, y, width - pad_x, y + box_h], radius=14, fill="#f1f5f9")
        col1_x = pad_x + 22
        col2_x = width // 2 + 10
        draw.text((col1_x, y + 16), f"Masa: {doc.get('table_name', '-')}", fill="#0f172a", font=f_info_val)
        draw.text((col2_x, y + 16), f"Garson: {doc.get('waiter_name', '-')}", fill="#0f172a", font=f_info_val)
        draw.text((col1_x, y + 48), f"Kasiyer: {doc.get('cashier_name', '-')}", fill="#0f172a", font=f_info_val)
        draw.text((col2_x, y + 48), f"Belge No: {doc.get('doc_no', '-')}", fill="#0f172a", font=f_info_val)

        y += box_h + 28

        # Table Headers
        col_qty_x = pad_x + 430
        col_unit_right = width - pad_x - 135
        col_tot_right = width - pad_x

        draw.text((pad_x, y), "ÜRÜN / AÇIKLAMA", fill="#64748b", font=f_th)
        draw.text((col_qty_x, y), "MİKTAR", fill="#64748b", font=f_th)
        u_bbox = draw.textbbox((0, 0), "BİRİM", font=f_th)
        draw.text((col_unit_right - (u_bbox[2] - u_bbox[0]), y), "BİRİM", fill="#64748b", font=f_th)
        t_bbox = draw.textbbox((0, 0), "TUTAR", font=f_th)
        draw.text((col_tot_right - (t_bbox[2] - t_bbox[0]), y), "TUTAR", fill="#64748b", font=f_th)

        y += 24
        draw.line([(pad_x, y), (width - pad_x, y)], fill="#e2e8f0", width=2)
        y += 12

        # Line Items
        for it in items:
            p_name = str(it.get("product_name") or "")
            if it.get("variant"):
                p_name += f" ({it.get('variant')})"
            qty_val = float(it.get("quantity") or 0)
            qty_str = str(int(qty_val)) if qty_val.is_integer() else f"{qty_val:.3f}".rstrip("0").rstrip(".") + " Kg"
            unit_str = f"₺{float(it.get('unit_price') or 0):.2f}"
            tot_str = f"₺{float(it.get('total_price') or 0):.2f}"

            draw.text((pad_x, y), p_name[:38], fill="#0f172a", font=f_td)
            q_bbox = draw.textbbox((0, 0), qty_str, font=f_td_mono)
            draw.text((col_qty_x + 26 - (q_bbox[2] - q_bbox[0]) // 2, y), qty_str, fill="#0f172a", font=f_td_mono)

            ub = draw.textbbox((0, 0), unit_str, font=f_td_mono)
            draw.text((col_unit_right - (ub[2] - ub[0]), y), unit_str, fill="#0f172a", font=f_td_mono)

            tb = draw.textbbox((0, 0), tot_str, font=f_td_mono_b)
            draw.text((col_tot_right - (tb[2] - tb[0]), y), tot_str, fill="#0f172a", font=f_td_mono_b)

            y += 32
            draw.line([(pad_x, y), (width - pad_x, y)], fill="#f1f5f9", width=1)
            y += 10

        y += 8
        draw.line([(pad_x, y), (width - pad_x, y)], fill="#0f172a", width=3)
        y += 18

        # Right-aligned helper
        def draw_right_line(text_str: str, font_obj, color: str = "#0f172a", step: int = 28):
            nonlocal y
            bb = draw.textbbox((0, 0), text_str, font=font_obj)
            draw.text((width - pad_x - (bb[2] - bb[0]), y), text_str, fill=color, font=font_obj)
            y += step

        subtotal = float(doc.get("subtotal") or 0.0)
        kuver = float(doc.get("kuver") or 0.0)
        service_charge = float(doc.get("service_charge") or 0.0)
        discount = float(doc.get("discount") or 0.0)
        vat_10 = float((doc.get("vat_summary") or {}).get("vat_10", {}).get("tax") or 0.0)
        grand_total = float(doc.get("grand_total") or 0.0)

        draw_right_line(f"Ara Toplam: ₺{subtotal:.2f}", f_td_mono_b)
        if kuver > 0:
            draw_right_line(f"Kuver Bedeli: ₺{kuver:.2f}", f_td_mono_b)
        if service_charge > 0:
            draw_right_line(f"Servis Bedeli: ₺{service_charge:.2f}", f_td_mono_b)
        if discount > 0:
            draw_right_line(f"İndirim: -₺{discount:.2f}", f_td_mono_b, color="#dc2626")
        draw_right_line(f"Hesaplanan KDV (%10): ₺{vat_10:.2f}", f_td_mono, color="#334155")

        y += 4
        draw.line([(pad_x, y), (width - pad_x, y)], fill="#e2e8f0", width=2)
        y += 14
        draw_right_line(f"GENEL TOPLAM: ₺{grand_total:.2f}", f_total_big, color="#0f172a", step=38)

        if payments:
            draw.line([(pad_x, y), (width - pad_x, y)], fill="#e2e8f0", width=2)
            y += 14
            for p in payments:
                lbl = f"ÖDEME YÖNTEMİ ({p.get('label') or p.get('method', '')}):"
                val = f"₺{float(p.get('amount') or 0.0):.2f}"
                draw.text((pad_x, y), lbl, fill="#047857", font=f_info_val)
                vb = draw.textbbox((0, 0), val, font=f_td_mono_b)
                draw.text((width - pad_x - (vb[2] - vb[0]), y), val, fill="#047857", font=f_td_mono_b)
                y += 30

        y += 10
        draw.line([(pad_x, y), (width - pad_x, y)], fill="#e2e8f0", width=2)
        y += 20

        # GİB QR Code & Signature Footer
        qr_str = str(doc.get("qr_code_content") or "")
        qr_line1 = qr_str[:62]
        qr_line2 = qr_str[62:124]
        draw.text((pad_x, y), qr_line1, fill="#64748b", font=f_qr_text)
        if qr_line2:
            draw.text((pad_x, y + 20), qr_line2, fill="#64748b", font=f_qr_text)
        draw.text(
            (pad_x, y + 48),
            "Bu belge 509 Sıra No.lu VUK Genel Tebliği uyarınca düzenlenmiştir.",
            fill="#1e293b",
            font=f_footer_b
        )

        # Draw stylized QR icon on bottom-right
        qx = width - pad_x - 68
        qy = y
        draw.rounded_rectangle([qx, qy, qx + 26, qy + 26], radius=4, outline="#0f172a", width=4)
        draw.rounded_rectangle([qx + 40, qy, qx + 66, qy + 26], radius=4, outline="#0f172a", width=4)
        draw.rounded_rectangle([qx, qy + 40, qx + 26, qy + 66], radius=4, outline="#0f172a", width=4)
        draw.rectangle([qx + 42, qy + 42, qx + 50, qy + 66], fill="#0f172a")
        draw.rectangle([qx + 56, qy + 42, qx + 66, qy + 52], fill="#0f172a")
        draw.rectangle([qx + 56, qy + 58, qx + 66, qy + 66], fill="#0f172a")

        final_h = min(base_height, y + 100)
        cropped = img.crop((0, 0, width, final_h))

        pdf_buffer = io.BytesIO()
        cropped.save(pdf_buffer, format="PDF", resolution=150.0)
        return pdf_buffer.getvalue()
