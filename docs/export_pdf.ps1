$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
    $docPath = "C:\Users\asus\Desktop\code\Git\bizai\docs\SRS_Document_BizAI_IEEE830.docx"
    $pdfPath = "C:\Users\asus\Desktop\code\Git\bizai\docs\SRS_Document_BizAI_IEEE830.pdf"
    $doc = $word.Documents.Open($docPath)
    $pages = $doc.ComputeStatistics(2)
    Write-Host "Total Pages: $pages"

    # Find page numbers of key headings
    $headings = @(
        "1.  Introduction",
        "1.1  Purpose",
        "1.4  Product Scope",
        "2.  Overall Description",
        "2.1  Product Perspective",
        "2.2  Product Functions",
        "2.3  User Classes",
        "3.  External Interface",
        "4.  System Features",
        "4.1  Multi-Tenant Authentication",
        "4.2  Customer Relationship",
        "4.3  Product Catalog",
        "4.4  Inventory Movement",
        "4.5  Sales Order",
        "4.6  Automated Invoicing",
        "4.7  Operating Expense",
        "4.8  Executive Analytics",
        "4.9  Context-Grounded AI",
        "4.10  Automated Demo",
        "5.  Other Nonfunctional",
        "6.  Other Requirements",
        "Appendix A: Glossary",
        "Appendix B: Analysis Models",
        "B.1  Data Flow Models",
        "B.2  Data Models",
        "B.3  Finite State Machine",
        "B.4  Data Validation",
        "B.5  Error Code Registry",
        "B.6  Requirements Traceability",
        "Appendix C: To Be Determined",
        "Appendix D: Client Requirements"
    )

    foreach ($h in $headings) {
        $find = $doc.Content.Find
        $find.ClearFormatting()
        $find.Text = $h
        if ($find.Execute()) {
            $pageNum = $find.Parent.Information(3) # 3 = wdActiveEndPageNumber
            Write-Host "$h -> Page $pageNum"
        }
    }

    $doc.ExportAsFixedFormat($pdfPath, 17) # 17 = wdExportFormatPDF
    Write-Host "Exported PDF successfully to $pdfPath"
    $doc.Close([ref]$false)
} finally {
    $word.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
}
