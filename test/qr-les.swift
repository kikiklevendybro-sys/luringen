// Dev check: decodes QR code images with macOS CoreImage (independent of our encoder).
// Usage: swift test/qr-les.swift image.png [...]  → prints "path<TAB>decoded text" (or NONE).
import CoreImage
import Foundation

let detektor = CIDetector(
  ofType: CIDetectorTypeQRCode, context: CIContext(),
  options: [CIDetectorAccuracy: CIDetectorAccuracyHigh])!

for sti in CommandLine.arguments.dropFirst() {
  guard let bilde = CIImage(contentsOf: URL(fileURLWithPath: sti)) else {
    print("\(sti)\tERR_LOAD")
    continue
  }
  if let treff = detektor.features(in: bilde).first as? CIQRCodeFeature, let tekst = treff.messageString {
    print("\(sti)\t\(tekst)")
  } else {
    print("\(sti)\tNONE")
  }
}
