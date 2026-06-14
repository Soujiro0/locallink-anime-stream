import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

export default function Dropdown({ label, value, options, onChange, placeholder = "All" }) {
	const [isOpen, setIsOpen] = useState(false);
	const ref = useRef(null);

	// Close on outside click
	useEffect(() => {
		const handleClickOutside = (e) => {
			if (ref.current && !ref.current.contains(e.target)) {
				setIsOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	// Close on Escape
	useEffect(() => {
		const handleEscape = (e) => {
			if (e.key === "Escape") setIsOpen(false);
		};
		if (isOpen) {
			document.addEventListener("keydown", handleEscape);
			return () => document.removeEventListener("keydown", handleEscape);
		}
	}, [isOpen]);

	// Resolve display text
	const getDisplayText = () => {
		if (!value) return placeholder;
		const found = options.find((opt) =>
			typeof opt === "object" ? opt.value === value : opt === value
		);
		if (!found) return value;
		return typeof found === "object" ? found.label : found;
	};

	const handleSelect = (optValue) => {
		onChange(optValue);
		setIsOpen(false);
	};

	return (
		<div className="relative" ref={ref}>
			{/* Label */}
			{label && (
				<label className="text-xs font-semibold text-text-muted uppercase tracking-wider block mb-1">
					{label}
				</label>
			)}

			{/* Trigger */}
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className={`w-full flex items-center justify-between gap-2 bg-surface-base border text-text-primary text-sm rounded-lg px-3 py-2.5 outline-none transition-colors cursor-pointer ${
					isOpen ? "border-netflix-red" : "border-surface-border hover:border-text-muted"
				}`}
				id={`dropdown-${label?.toLowerCase().replace(/\s/g, "-") || "select"}`}
			>
				<span className="truncate">{getDisplayText()}</span>
				<ChevronDown
					className={`w-4 h-4 shrink-0 text-text-muted transition-transform duration-200 ${
						isOpen ? "rotate-180" : ""
					}`}
				/>
			</button>

			{/* Dropdown Panel */}
			{isOpen && (
				<div className="absolute z-50 w-full mt-1 bg-surface-base border border-surface-border rounded-lg shadow-2xl shadow-black/60 overflow-hidden animate-dropdown-open">
					{/* Header label inside panel */}
					{label && (
						<div className="px-3 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider border-b border-surface-border">
							{label}
						</div>
					)}

					{/* Options */}
					<div className="max-h-64 overflow-y-auto">
						{/* "All" / placeholder option */}
						<button
							type="button"
							onClick={() => handleSelect("")}
							className={`w-full text-left px-3 py-2.5 text-sm transition-colors ${
								!value
									? "bg-netflix-red text-white font-medium"
									: "text-text-primary hover:bg-surface-raised"
							}`}
						>
							{placeholder}
						</button>

						{options.map((opt) => {
							const optValue = typeof opt === "object" ? opt.value : opt;
							const optLabel = typeof opt === "object" ? opt.label : opt;
							const isActive = value === optValue;

							return (
								<button
									key={optValue}
									type="button"
									onClick={() => handleSelect(optValue)}
									className={`w-full text-left px-3 py-2.5 text-sm transition-colors ${
										isActive
											? "bg-netflix-red text-white font-medium"
											: "text-text-primary hover:bg-surface-raised"
									}`}
								>
									{optLabel}
								</button>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}
