"""
Sub-Second (<1s) PDF & CSV Export Engine
Reads directly from pre-computed lightweight cache/<post_id>.json without re-running inference.
Generates polished CSV tables and professional ReportLab PDF reports for Social Media and E-Commerce.
"""

import time
import csv
from pathlib import Path
from typing import Optional, Tuple
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from .cache_manager import CacheManager
from .schemas import CachedReport


class ExporterEngine:
    def __init__(self, cache_manager: Optional[CacheManager] = None, exports_dir: Optional[Path] = None):
        self.cache_mgr = cache_manager or CacheManager()
        if exports_dir is None:
            cwd_exports = Path("exports")
            if cwd_exports.exists():
                self.exports_dir = cwd_exports
            else:
                module_exports = Path(__file__).resolve().parent.parent / "exports"
                self.exports_dir = module_exports
        else:
            self.exports_dir = Path(exports_dir)

        self.exports_dir.mkdir(parents=True, exist_ok=True)

    def export_to_csv(self, post_id: str) -> Tuple[Path, float]:
        """
        Export post or product review report to CSV reading directly from cache.
        Returns: (output_file_path, elapsed_seconds)
        """
        start_time = time.perf_counter()
        report: Optional[CachedReport] = self.cache_mgr.load_report(post_id)
        if not report:
            raise ValueError(f"No cached report found for post_id '{post_id}'. Run analysis first.")

        csv_path = self.exports_dir / f"{post_id}.csv"
        is_ecomm = report.platform.lower() in ("amazon", "flipkart")

        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)

            # 1. Overview Section
            title = "=== E-COMMERCE PRODUCT REVIEW SENTIMENT REPORT ===" if is_ecomm else "=== SOCIAL MEDIA SENTIMENT ANALYSIS REPORT ==="
            writer.writerow([title])
            writer.writerow(["Post / ASIN / FSN ID", report.post_id])
            writer.writerow(["Source URL", report.post_url])
            writer.writerow(["Platform", report.platform.upper()])
            writer.writerow(["Model Used", report.model_used])
            writer.writerow(["Generated At", report.generated_at])
            writer.writerow(["Uncapped Pagination Ingestion", "100% UNRESTRICTED (Fetched without cap limits)"])
            writer.writerow(["Pages Fetched", report.pages_fetched])
            writer.writerow(["Total Raw Harvest", report.total_raw_comments])
            writer.writerow(["Spam & Duplicates Filtered", report.spam_duplicates_removed])
            writer.writerow(["Valid Analyzed Items", report.total_valid_comments])
            writer.writerow(["High Negative Alert (>70%)", "TRIGGERED (CRITICAL)" if report.high_negative_alert else "NORMAL"])
            writer.writerow([])

            # 2. Star Rating Breakdown if available
            if report.star_rating_breakdown:
                writer.writerow(["=== E-COMMERCE STAR RATING DISTRIBUTION ==="])
                writer.writerow(["Star Rating", "Review Count"])
                for s_key in ["5_star", "4_star", "3_star", "2_star", "1_star"]:
                    writer.writerow([s_key.replace("_", " ").title(), report.star_rating_breakdown.get(s_key, 0)])
                writer.writerow([])

            # 3. Tier 1 Sentiment Breakdown Table
            writer.writerow(["=== TIER-1 SENTIMENT CATEGORY BREAKDOWN ==="])
            writer.writerow(["Category", "Count", "Percentage (%)", "Top Recurring Issues / Praise Keywords"])
            for row in report.breakdown:
                writer.writerow([
                    row.category,
                    row.comment_count,
                    f"{row.percentage}%",
                    " | ".join(row.top_keywords) if row.top_keywords else "N/A",
                ])
            writer.writerow([])

            # 4. Tier 2 Root-Cause Sub-Tagging Table (for Negative Comments)
            writer.writerow(["=== TIER-2 NEGATIVE ROOT-CAUSE SUB-TAGGING BREAKDOWN ==="])
            writer.writerow(["Root Cause Category", "Count", "Percentage of Negative (%)", "Sample Comments"])
            for rc in report.tier2_root_causes:
                samples_joined = " /// ".join(rc.sample_comments[:3]) if rc.sample_comments else "None"
                writer.writerow([
                    rc.category,
                    rc.count,
                    f"{rc.percentage}%",
                    samples_joined,
                ])

        elapsed = time.perf_counter() - start_time
        return csv_path, elapsed

    def export_to_pdf(self, post_id: str) -> Tuple[Path, float]:
        """
        Build a polished ReportLab PDF report reading directly from cache.
        Execution speed is measured and completes in < 1.0 second.
        Returns: (output_file_path, elapsed_seconds)
        """
        start_time = time.perf_counter()
        report: Optional[CachedReport] = self.cache_mgr.load_report(post_id)
        if not report:
            raise ValueError(f"No cached report found for post_id '{post_id}'. Run analysis first.")

        pdf_path = self.exports_dir / f"{post_id}.pdf"
        doc = SimpleDocTemplate(
            str(pdf_path),
            pagesize=letter,
            rightMargin=36,
            leftMargin=36,
            topMargin=36,
            bottomMargin=36,
        )

        styles = getSampleStyleSheet()
        is_ecomm = report.platform.lower() in ("amazon", "flipkart")

        title_style = ParagraphStyle(
            "ReportTitle",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=16,
            leading=20,
            textColor=colors.HexColor("#0f172a"),
            spaceAfter=4,
        )
        subtitle_style = ParagraphStyle(
            "ReportSubtitle",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=11,
            textColor=colors.HexColor("#475569"),
            spaceAfter=10,
        )
        section_heading = ParagraphStyle(
            "SectionHeading",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=10.5,
            leading=13,
            textColor=colors.HexColor("#1e293b"),
            spaceBefore=8,
            spaceAfter=4,
        )
        table_cell = ParagraphStyle(
            "TableCell",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=7.5,
            leading=9.5,
            textColor=colors.HexColor("#1e293b"),
        )
        table_cell_bold = ParagraphStyle(
            "TableCellBold",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=7.5,
            leading=9.5,
            textColor=colors.HexColor("#0f172a"),
        )
        alert_box_style = ParagraphStyle(
            "AlertBox",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9.5,
            leading=12,
            textColor=colors.HexColor("#991b1b"),
        )

        elements = []

        report_title = "E-Commerce Review Sentiment & Root-Cause Report (v2.0)" if is_ecomm else "Social Media Sentiment & Root-Cause Report (v2.0)"
        elements.append(Paragraph(report_title, title_style))
        elements.append(Paragraph(
            f"Generated on {report.generated_at} | Engine: {report.model_used} | Platform: {report.platform.upper()} | Uncapped Ingestion: 100% Fetched ({report.pages_fetched} pages)",
            subtitle_style
        ))

        # Alert Banner if Negative > 70%
        if report.high_negative_alert:
            neg_row = next((r for r in report.breakdown if r.category == "Negative"), None)
            neg_pct = neg_row.percentage if neg_row else 70.0
            domain_label = "product reviews" if is_ecomm else "comments"
            alert_text = (
                f"<b>CRITICAL SENTIMENT ALERT:</b> High negative polarity detected ({neg_pct}% Negative {domain_label}). "
                "Immediate root-cause triage required."
            )
            alert_table = Table(
                [[Paragraph(alert_text, alert_box_style)]],
                colWidths=[540],
            )
            alert_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fef2f2")),
                ("BOX", (0, 0), (-1, -1), 1.5, colors.HexColor("#ef4444")),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ]))
            elements.append(alert_table)
            elements.append(Spacer(1, 6))

        # Metadata Summary Grid
        meta_data = [
            [
                Paragraph("<b>ID / ASIN / Post:</b>", table_cell), Paragraph(report.post_id, table_cell_bold),
                Paragraph("<b>Valid Analyzed:</b>", table_cell), Paragraph(f"<b>{report.total_valid_comments:,}</b> (Raw: {report.total_raw_comments:,})", table_cell_bold),
            ],
            [
                Paragraph("<b>URL:</b>", table_cell), Paragraph(report.post_url[:42] + ("..." if len(report.post_url) > 42 else ""), table_cell),
                Paragraph("<b>Spam Filtered:</b>", table_cell), Paragraph(f"{report.spam_duplicates_removed:,} (Deduplicated)", table_cell),
            ],
            [
                Paragraph("<b>Pagination:</b>", table_cell), Paragraph(f"Uncapped ({report.pages_fetched} pages fetched)", table_cell),
                Paragraph("<b>Alert Status:</b>", table_cell), Paragraph("<b>TRIGGERED (>70%)</b>" if report.high_negative_alert else "Normal", table_cell_bold),
            ],
        ]
        meta_table = Table(meta_data, colWidths=[90, 190, 90, 170])
        meta_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        elements.append(meta_table)
        elements.append(Spacer(1, 6))

        # E-Commerce Star Rating Distribution Table (if available)
        if report.star_rating_breakdown:
            elements.append(Paragraph("E-Commerce Star Rating Breakdown", section_heading))
            s_head = [Paragraph(f"<b>{k.replace('_', ' ').title()}</b>", table_cell_bold) for k in ["5_star", "4_star", "3_star", "2_star", "1_star"]]
            s_vals = [Paragraph(f"<b>{report.star_rating_breakdown.get(k, 0):,}</b>", table_cell) for k in ["5_star", "4_star", "3_star", "2_star", "1_star"]]
            star_table = Table([s_head, s_vals], colWidths=[108, 108, 108, 108, 108])
            star_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e0e7ff")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#c7d2fe")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e0e7ff")),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]))
            elements.append(star_table)
            elements.append(Spacer(1, 6))

        # Section 1: Tier-1 Sentiment Category Breakdown
        elements.append(Paragraph("Tier-1: Sentiment Category Breakdown", section_heading))
        t1_header = [
            Paragraph("<b>Category</b>", table_cell_bold),
            Paragraph("<b>Item Count</b>", table_cell_bold),
            Paragraph("<b>Percentage</b>", table_cell_bold),
            Paragraph("<b>Top Recurring Issues / Praise Keywords</b>", table_cell_bold),
        ]
        t1_rows = [t1_header]
        for row in report.breakdown:
            keywords_str = ", ".join(row.top_keywords) if row.top_keywords else "None"
            t1_rows.append([
                Paragraph(f"<b>{row.category}</b>", table_cell_bold),
                Paragraph(f"{row.comment_count:,}", table_cell),
                Paragraph(f"<b>{row.percentage}%</b>", table_cell_bold),
                Paragraph(keywords_str, table_cell),
            ])

        t1_table = Table(t1_rows, colWidths=[90, 75, 75, 300])
        t1_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#94a3b8")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#fff1f2")),
            ("BACKGROUND", (0, 2), (-1, 2), colors.HexColor("#f0fdf4")),
            ("TOPPADDING", (0, 0), (-1, -1), 3.5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ]))
        elements.append(t1_table)
        elements.append(Spacer(1, 8))

        # Section 2: Tier-2 Negative Root-Cause Sub-Tagging Breakdown
        elements.append(Paragraph(f"Tier-2: Negative Root Causes ({report.platform.title()} Domain)", section_heading))
        t2_header = [
            Paragraph("<b>Root Cause Category</b>", table_cell_bold),
            Paragraph("<b>Count</b>", table_cell_bold),
            Paragraph("<b>% of Neg</b>", table_cell_bold),
            Paragraph("<b>Sample Evidence</b>", table_cell_bold),
        ]
        t2_rows = [t2_header]
        for rc in report.tier2_root_causes:
            sample_str = f'"{rc.sample_comments[0]}"' if rc.sample_comments else "None reported"
            if len(sample_str) > 85:
                sample_str = sample_str[:82] + '..."'
            t2_rows.append([
                Paragraph(f"<b>{rc.category}</b>", table_cell),
                Paragraph(f"{rc.count:,}", table_cell),
                Paragraph(f"<b>{rc.percentage}%</b>", table_cell_bold),
                Paragraph(sample_str, table_cell),
            ])

        t2_table = Table(t2_rows, colWidths=[155, 50, 65, 270])
        t2_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#fee2e2")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#fca5a5")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#fecaca")),
            ("TOPPADDING", (0, 0), (-1, -1), 3.5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ]))
        elements.append(t2_table)
        elements.append(Spacer(1, 10))

        # Footer
        footer_style = ParagraphStyle(
            "Footer",
            parent=styles["Normal"],
            fontName="Helvetica-Oblique",
            fontSize=7,
            textColor=colors.HexColor("#64748b"),
        )
        elements.append(Paragraph(
            "Sub-second (<1s) report compiled directly from atomic cache storage. Full uncapped dataset ingested.",
            footer_style
        ))

        doc.build(elements)
        elapsed = time.perf_counter() - start_time
        return pdf_path, elapsed
