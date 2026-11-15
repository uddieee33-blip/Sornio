Pod::Spec.new do |s|
  s.name = 'SornioLan'
  s.version = '0.1.0'
  s.summary = 'Native local shop discovery and TLS inspection'
  s.description = 'Sornio native LAN operations; no financial ledger.'
  s.author = 'Sornio'
  s.homepage = 'https://github.com/uddieee33-blip/Sornio'
  s.license = { :type => 'MIT' }
  s.platforms = { :ios => '16.4' }
  s.source = { :git => s.homepage }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.swift_version = '5.9'
end
